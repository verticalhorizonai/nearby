// The checkout handoff (build ruling 42): the checkout_url an outside assistant gets from the Nearby MCP server opens
// an app page that changes nothing (preview). Its one button, "Review in Nearby", is a POST under the origin rule
// (accept): it re-checks with the app's matching code that the offer still fits, then, in this browser's session,
// creates the stop (marked added by the assistant; idempotent for the same link) and one proposed pick, and the person
// goes on through the existing flow: Yes, the confirmation token, PayPal, the receipt.
// The link is data: the pick's sentence comes from Nearby's own template (3.6.4), never from the link, and the title
// is text only, at most 80 characters, and never sent to the model.
import { createHash } from 'node:crypto';
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { HandoffParams, HandoffPreview, HandoffResult } from '../../shared/types.js';
import { HANDOFF_DEFAULT_TITLE, HANDOFF_TITLE_MAX_LENGTH, HANDOFFS_PER_SESSION_PER_HOUR } from '../../shared/types.js';
import { ApiError, badRequest, notFound } from '../../api/http.js';
import { applyLazyTransitions } from '../proposals/lifecycle.js';
import { fallbackReason } from '../agent/fallback.js';
import type { WindowLimiter } from '../offersMcp/windowLimiter.js';
import {
  OUT_OF_AREA_NOTE,
  inDemoArea,
  inWindow,
  isUuid,
  loadOfferFacts,
  matchStop,
  parseStop,
  showable,
  type OfferFacts,
  type StopQuery,
} from '../offersMcp/offerSearch.js';

export const NO_LONGER_FITS_NOTE = 'This offer no longer fits that place and time.';
export const TIME_PASSED_NOTE = 'That time has passed, or it is more than 7 days away, so Nearby cannot add this stop.';

/** A title from a link: text only (control and format characters removed, spaces collapsed), at most 80 characters. */
export function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return HANDOFF_DEFAULT_TITLE;
  const text = raw.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(text).slice(0, HANDOFF_TITLE_MAX_LENGTH).join('').trim();
  return cut === '' ? HANDOFF_DEFAULT_TITLE : cut;
}

/** The stop's address line: the place the assistant gave, as coordinates (there is no address in the link). */
export function stopAddress(stop: StopQuery): string {
  return `Near ${stop.location.lat.toFixed(4)}, ${stop.location.lng.toFixed(4)}`;
}

/** One stop per link in a session: the offer, the place and the start time (the title is not part of it). */
export function handoffEventId(offerId: string, stop: StopQuery): string {
  const key = `${offerId.toLowerCase()}|${stop.location.lat.toFixed(6)}|${stop.location.lng.toFixed(6)}|${stop.startsAt.toISOString()}`;
  return `assistant:${createHash('sha256').update(key).digest('hex').slice(0, 48)}`;
}

interface Parsed {
  facts: OfferFacts;
  stop: StopQuery;
  title: string;
}

export class HandoffService {
  constructor(
    private readonly db: Db,
    private readonly limiter: WindowLimiter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async parse(p: Partial<HandoffParams>): Promise<Parsed> {
    if (!isUuid(p.offer)) throw badRequest('offer must be an offer id.');
    const parsed = parseStop(p.lat, p.lng, p.at);
    if ('error' in parsed) throw badRequest(parsed.error.replace('starts_at', 'at'));
    const facts = await loadOfferFacts(this.db, p.offer);
    if (!facts) throw notFound('No offer exists with this id.');
    return { facts, stop: parsed.stop, title: cleanTitle(p.title) };
  }

  /** GET /api/handoff: what the page shows. Reads only; writes nothing. */
  async preview(p: Partial<HandoffParams>): Promise<HandoffPreview> {
    const { facts, stop, title } = await this.parse(p);
    let note: string | null = null;
    if (!inDemoArea(stop.location)) note = OUT_OF_AREA_NOTE;
    else if (!inWindow(stop.startsAt, this.now())) note = TIME_PASSED_NOTE;
    else if (!showable((await matchStop(this.db, stop)).candidates, facts.id)) note = NO_LONGER_FITS_NOTE;
    return {
      offerId: facts.id,
      offerTitle: facts.title,
      merchantName: facts.merchant_name,
      merchantIsSample: facts.merchant_is_sample,
      priceCents: facts.price_cents,
      isDeposit: facts.is_deposit,
      validWindow: { validDays: facts.valid_days, validStartTime: facts.valid_start_time, validEndTime: facts.valid_end_time },
      title,
      address: stopAddress(stop),
      location: stop.location,
      startsAt: stop.startsAt.toISOString(),
      endsAt: stop.endsAt.toISOString(),
      fits: note === null,
      note,
    };
  }

  /** POST /api/handoff ("Review in Nearby"): the stop and its proposed pick, once per link per session. */
  async accept(sessionId: string, p: Partial<HandoffParams>): Promise<HandoffResult> {
    if (!this.limiter.take(sessionId)) {
      throw new ApiError(429, 'rate_limited', `At most ${HANDOFFS_PER_SESSION_PER_HOUR} handoffs an hour from one browser. Try again later.`);
    }
    const { facts, stop, title } = await this.parse(p);
    if (!inDemoArea(stop.location)) throw badRequest(OUT_OF_AREA_NOTE);
    const eventId = handoffEventId(facts.id, stop);
    const now = this.now();

    const existing = await this.db.query<{ id: string }>('SELECT id FROM appointments WHERE session_id = $1 AND source_event_id = $2', [sessionId, eventId]);
    if (existing.rows[0]) await applyLazyTransitions(this.db, now, { sessionId, appointmentId: existing.rows[0].id });

    return withTransaction(this.db, async (tx) => {
      // One handoff of a link at a time per session, so a double click cannot make two picks.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${sessionId}|${eventId}`]);
      const appt = await tx.query<{ id: string }>('SELECT id FROM appointments WHERE session_id = $1 AND source_event_id = $2', [sessionId, eventId]);
      const appointmentId = appt.rows[0]?.id ?? null;
      if (appointmentId) {
        const kept = await tx.query<{ id: string }>(
          `SELECT id FROM proposals WHERE session_id = $1 AND appointment_id = $2 AND offer_id = $3 AND status <> 'expired'
            ORDER BY created_at DESC LIMIT 1`,
          [sessionId, appointmentId, facts.id],
        );
        if (kept.rows[0]) return { appointmentId, proposalId: kept.rows[0].id, created: false };
      }

      // Re-check with the app's matching code that the offer is still a candidate that may be shown (3.5).
      if (!inWindow(stop.startsAt, now)) throw new ApiError(409, 'offer_unavailable', TIME_PASSED_NOTE);
      const bought = appointmentId
        ? await tx.query<{ offer_id: string }>(
            `SELECT DISTINCT u.offer_id FROM purchases u JOIN proposals p ON p.id = u.proposal_id
              WHERE p.session_id = $1 AND p.appointment_id = $2 AND u.status = 'completed'`,
            [sessionId, appointmentId],
          )
        : { rows: [] };
      const match = await matchStop(this.db, stop, new Set(bought.rows.map((r) => r.offer_id)));
      const candidate = showable(match.candidates, facts.id);
      if (!candidate) throw new ApiError(409, 'offer_unavailable', NO_LONGER_FITS_NOTE);

      const id =
        appointmentId ??
        (
          await tx.query<{ id: string }>(
            `INSERT INTO appointments (session_id, source_event_id, title, starts_at, ends_at, location_text, location_lat, location_lng, added_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'assistant') RETURNING id`,
            [sessionId, eventId, title, stop.startsAt, stop.endsAt, stopAddress(stop), stop.location.lat, stop.location.lng],
          )
        ).rows[0].id;
      const proposal = await tx.query<{ id: string }>(
        `INSERT INTO proposals (session_id, appointment_id, offer_id, merchant_id, rank, score, reason, distance_meters, source, status, created_at)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,'assistant','proposed',$8) RETURNING id`,
        [sessionId, id, facts.id, facts.merchant_id, candidate.score, fallbackReason(candidate, stop.startsAt), Math.round(candidate.distanceMeters), now],
      );
      return { appointmentId: id, proposalId: proposal.rows[0].id, created: true };
    });
  }
}
