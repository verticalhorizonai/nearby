// Picks for an appointment (tasks 15, 16; REQ-02-02, REQ-02-03, REQ-02-06..08, REQ-03-12): existing non-expired
// proposals are returned as they are; otherwise the candidates are computed in code (3.5), the agent or the fallback
// chooses among them (3.6), and up to two proposals are saved as `proposed`.
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { AppointmentPicks, DayOfWeek, OfferCategory } from '../../shared/types.js';
import type { AppointmentsService } from '../appointments/appointmentsService.js';
import { applyLazyTransitions } from '../proposals/lifecycle.js';
import { loadAppointmentProposals, toPick } from '../proposals/proposalRows.js';
import { matchOffers, type MatchOffer, type MatchResult } from '../matching/matcher.js';
import type { ChooseResult, PickChooser } from '../agent/chooser.js';

interface OfferRow {
  id: string;
  merchant_id: string;
  merchant_name: string;
  lat: number;
  lng: number;
  category: OfferCategory;
  valid_days: DayOfWeek[];
  valid_start_time: string;
  valid_end_time: string;
}

/** All live offers with their merchants (offers are live from the moment they are published, 3.9.1). */
export async function loadMatchOffers(db: Db): Promise<MatchOffer[]> {
  const { rows } = await db.query<OfferRow>(
    `SELECT o.id, o.merchant_id, m.name AS merchant_name, m.location_lat AS lat, m.location_lng AS lng, o.category,
            o.valid_days, o.valid_start_time, o.valid_end_time
       FROM offers o JOIN merchants m ON m.id = o.merchant_id ORDER BY o.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    merchantId: r.merchant_id,
    merchantName: r.merchant_name,
    merchantLocation: { lat: r.lat, lng: r.lng },
    category: r.category,
    validDays: r.valid_days,
    validStartTime: r.valid_start_time,
    validEndTime: r.valid_end_time,
  }));
}

export class PicksService {
  private readonly inflight = new Map<string, Promise<AppointmentPicks>>();

  constructor(
    private readonly db: Db,
    private readonly appointments: AppointmentsService,
    private readonly chooser: PickChooser,
    private readonly now: () => Date = () => new Date(),
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  /** Candidates for one of the session's appointments (3.5), excluding offers this session bought for it. */
  async candidatesFor(sessionId: string, appointmentId: string): Promise<{ match: MatchResult; appt: Awaited<ReturnType<AppointmentsService['get']>> }> {
    const appt = await this.appointments.get(sessionId, appointmentId);
    const bought = await this.db.query<{ offer_id: string }>(
      `SELECT DISTINCT u.offer_id FROM purchases u JOIN proposals p ON p.id = u.proposal_id
        WHERE p.session_id = $1 AND p.appointment_id = $2 AND u.status = 'completed'`,
      [sessionId, appointmentId],
    );
    const match = matchOffers(
      { id: appt.id, startsAt: appt.starts_at, endsAt: appt.ends_at, location: { lat: appt.location_lat!, lng: appt.location_lng! } },
      await loadMatchOffers(this.db),
      new Set(bought.rows.map((r) => r.offer_id)),
    );
    return { match, appt };
  }

  /** GET /api/appointments/{id}/picks. Concurrent reads of one appointment share one run. */
  picks(sessionId: string, appointmentId: string): Promise<AppointmentPicks> {
    const key = `${sessionId}:${appointmentId}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.run(sessionId, appointmentId).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async run(sessionId: string, appointmentId: string): Promise<AppointmentPicks> {
    const appt = await this.appointments.get(sessionId, appointmentId);
    await applyLazyTransitions(this.db, this.now(), { sessionId, appointmentId });
    if (!appt.enabled) return { appointmentId, picks: [], noMatch: false };
    const existing = await loadAppointmentProposals(this.db, sessionId, appointmentId);
    if (existing.length > 0) return { appointmentId, picks: existing.map(toPick), noMatch: false };

    const { match } = await this.candidatesFor(sessionId, appointmentId);
    if (match.shown.length === 0) return { appointmentId, picks: [], noMatch: true };

    const result: ChooseResult = await this.chooser.choose({
      sessionId,
      appointment: {
        id: appt.id,
        title: appt.title,
        startsAt: appt.starts_at,
        endsAt: appt.ends_at,
        locationText: appt.location_text ?? '',
        lat: appt.location_lat!,
        lng: appt.location_lng!,
      },
      candidates: match.candidates,
      shown: match.shown,
      radiusMeters: match.radiusMeters,
    });
    if (result.source === 'fallback') {
      // One server log line whenever a fallback is used, naming which (kickoff, "The demo never depends on the model").
      this.log(`agent fallback used: ${result.fallbackCause ?? 'unknown'}${result.detail ? ` (${result.detail})` : ''} (appointment ${appointmentId})`);
    }
    if (result.picks.length === 0) return { appointmentId, picks: [], noMatch: true };

    const createdAt = this.now(); // the app's clock: the expiry clock of spec 3.9.1 starts here
    await withTransaction(this.db, async (tx) => {
      // A run's proposals replace any the agent saved through propose_offer during the run (G-16).
      await tx.query(
        `DELETE FROM proposals p WHERE p.session_id = $1 AND p.appointment_id = $2 AND p.status = 'proposed'
           AND NOT EXISTS (SELECT 1 FROM purchases u WHERE u.proposal_id = p.id)`,
        [sessionId, appointmentId],
      );
      let rank = 1;
      for (const pick of result.picks) {
        await tx.query(
          `INSERT INTO proposals (session_id, appointment_id, offer_id, merchant_id, rank, score, reason, distance_meters, source, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposed',$10)`,
          [sessionId, appointmentId, pick.candidate.offer.id, pick.candidate.offer.merchantId, rank++, pick.candidate.score,
            pick.reason, Math.round(pick.candidate.distanceMeters), result.source, createdAt],
        );
      }
    });
    const saved = await loadAppointmentProposals(this.db, sessionId, appointmentId);
    return { appointmentId, picks: saved.map(toPick), noMatch: false };
  }
}
