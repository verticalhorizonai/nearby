// Offer matching in plain code (spec 3.5): the four candidate rules, the widening to 3 miles, the score, the
// tie-break and the 0.35 threshold. A pure function: the 3.10.3 expected-results table is its test.
// REQ-02-06, REQ-02-07, REQ-02-08.
import type { DayOfWeek, GeoPoint, OfferCategory } from '../../shared/types.js';
import { MIN_PICK_SCORE, MAX_PICKS_PER_APPOINTMENT } from '../../shared/types.js';
import { haversineMeters } from './geo.js';
import { isDroppedWhenPoor, timeFit, TIME_FIT_POOR } from './timeFit.js';
import { parseHhMm, phoenixClock } from '../time/phoenix.js';

export const RADIUS_NEAR_M = 1609;
export const RADIUS_WIDE_M = 4828;
export const WINDOW_BEFORE_MIN = 45;
export const WINDOW_AFTER_MIN = 60;
const SCORE_EPSILON = 1e-9;

export interface MatchAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: GeoPoint;
}

export interface MatchOffer {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantLocation: GeoPoint;
  category: OfferCategory;
  validDays: DayOfWeek[];
  validStartTime: string;
  validEndTime: string;
}

export interface Candidate {
  offer: MatchOffer;
  distanceMeters: number;
  timeFit: number;
  distanceScore: number;
  score: number;
  radiusMeters: number;
}

export interface MatchResult {
  radiusMeters: number;
  /** Every offer that passed the four rules at radiusMeters, best first. */
  candidates: Candidate[];
  /** At most two candidates with score >= 0.35: what is shown (3.5.3). */
  shown: Candidate[];
}

/** Rule 2: valid on the appointment's weekday, and the valid hours share at least one minute with
 * [start - 45 min, end + 60 min). valid_start inclusive, valid_end exclusive; Phoenix time. */
export function passesTimeWindow(appt: MatchAppointment, offer: MatchOffer): boolean {
  const start = phoenixClock(appt.startsAt);
  if (!offer.validDays.includes(start.day)) return false;
  const vs = parseHhMm(offer.validStartTime);
  const ve = parseHhMm(offer.validEndTime);
  if (vs === null || ve === null || vs >= ve) return false;
  const durationMin = Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000);
  const ws = start.minutes - WINDOW_BEFORE_MIN;
  const we = start.minutes + durationMin + WINDOW_AFTER_MIN;
  return Math.max(vs, ws) < Math.min(ve, we);
}

function candidatesAt(
  appt: MatchAppointment,
  offers: MatchOffer[],
  radiusM: number,
  alreadyBought: ReadonlySet<string>,
): Candidate[] {
  const startMinutes = phoenixClock(appt.startsAt).minutes;
  const out: Candidate[] = [];
  for (const offer of offers) {
    const distanceMeters = haversineMeters(appt.location, offer.merchantLocation);
    if (distanceMeters > radiusM) continue; // rule 1
    if (!passesTimeWindow(appt, offer)) continue; // rule 2
    if (alreadyBought.has(offer.id)) continue; // rule 3
    const fit = timeFit(offer.category, startMinutes);
    if (fit === TIME_FIT_POOR && isDroppedWhenPoor(offer.category)) continue; // rule 4
    const distanceScore = 1 - distanceMeters / radiusM;
    out.push({ offer, distanceMeters, timeFit: fit, distanceScore, score: 0.5 * distanceScore + 0.5 * fit, radiusMeters: radiusM });
  }
  return out.sort(compareCandidates);
}

/** Score descending, then nearer first, then offer id (3.5.3). */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (Math.abs(a.score - b.score) > SCORE_EPSILON) return b.score - a.score;
  if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
  return a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0;
}

/**
 * Candidates for an appointment: all four rules at 1 mile; if no offer passes all four, all four again at 3 miles.
 * alreadyBought holds the ids of offers this session bought (completed) for this appointment.
 */
export function matchOffers(appt: MatchAppointment, offers: MatchOffer[], alreadyBought: ReadonlySet<string> = new Set()): MatchResult {
  let radiusMeters = RADIUS_NEAR_M;
  let candidates = candidatesAt(appt, offers, RADIUS_NEAR_M, alreadyBought);
  if (candidates.length === 0) {
    radiusMeters = RADIUS_WIDE_M;
    candidates = candidatesAt(appt, offers, RADIUS_WIDE_M, alreadyBought);
  }
  const shown = candidates.filter((c) => c.score >= MIN_PICK_SCORE - SCORE_EPSILON).slice(0, MAX_PICKS_PER_APPOINTMENT);
  return { radiusMeters, candidates, shown };
}

/** Scores are shown rounded to two decimals (3.5.3; ruling 3). */
export function roundScore(score: number): number {
  return Math.round((score + Number.EPSILON) * 100) / 100;
}
