// Agent output validation (tasks 36, 37, 15; REQ-03-05, REQ-02-02; spec 3.6.3): the model's picks are checked in code
// before anything is shown — the offer must be one of that appointment's candidates, at most two picks, a reason of
// at most 25 words. distance_m shown is always the code's. Any failure discards the output: the fallback is used.
import { MAX_PICKS_PER_APPOINTMENT, PICK_REASON_MAX_WORDS } from '../../shared/types.js';
import type { Candidate } from '../matching/matcher.js';
import type { ChosenPick } from './fallback.js';

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Finds the JSON pick list in the model's final text: an array, or an object with a "picks" array. */
export function extractPicksJson(text: string): unknown[] | null {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const candidates = [text.trim(), ...(text.match(/```(?:json)?\s*([\s\S]*?)```/g) ?? []).map((b) => b.replace(/```(?:json)?/g, '').trim())];
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    const v = tryParse(c);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as { picks?: unknown }).picks)) return (v as { picks: unknown[] }).picks;
  }
  return null;
}

export type ValidationResult = { ok: true; picks: ChosenPick[] } | { ok: false; reason: string };

export function validateAgentPicks(raw: unknown[] | null, appointmentId: string, candidates: Candidate[]): ValidationResult {
  if (!raw) return { ok: false, reason: 'no JSON pick list' };
  if (raw.length > MAX_PICKS_PER_APPOINTMENT) return { ok: false, reason: 'more than two picks' };
  const byId = new Map(candidates.map((c) => [c.offer.id, c]));
  const picks: ChosenPick[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = (item ?? {}) as { appointment_id?: unknown; offer_id?: unknown; reason?: unknown };
    if (p.appointment_id !== appointmentId) return { ok: false, reason: 'pick for another appointment' };
    const c = typeof p.offer_id === 'string' ? byId.get(p.offer_id) : undefined;
    if (!c) return { ok: false, reason: 'offer is not a candidate' };
    if (seen.has(c.offer.id)) return { ok: false, reason: 'the same offer twice' };
    seen.add(c.offer.id);
    if (typeof p.reason !== 'string' || p.reason.trim() === '') return { ok: false, reason: 'empty reason' };
    if (wordCount(p.reason) > PICK_REASON_MAX_WORDS) return { ok: false, reason: 'reason over 25 words' };
    picks.push({ candidate: c, reason: p.reason.trim() }); // distance_m from the model is ignored (3.6.3)
  }
  return { ok: true, picks };
}
