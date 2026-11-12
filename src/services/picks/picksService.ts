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
import type { AgentActivity, RunReporter } from '../agent/agentActivity.js';
import { coordinatesText } from '../handoff/linkText.js';

/** What the model is told a handed-over stop is called, in place of the link's title (build ruling 42). */
export const ASSISTANT_STOP_TITLE_FOR_MODEL = 'A stop the person\'s assistant added';

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

/**
 * Which offers a session may see (build ruling 44): the seed offers, which are shared, and the offers this session
 * posted; never a removed one. A seed offer this session replaced with its own version is not seen in this session
 * (build ruling 45). With no session (the public MCP tools), the seed offers only. `n` is the number of the query
 * parameter that holds the session id (or null).
 */
export function visibleOffersSql(alias: string, n: number): string {
  return (
    `${alias}.removed_at IS NULL AND (${alias}.owner_session_id = $${n} OR (${alias}.owner_session_id IS NULL AND NOT EXISTS ` +
    `(SELECT 1 FROM offers copy WHERE copy.replaces_offer_id = ${alias}.id AND copy.owner_session_id = $${n} AND copy.removed_at IS NULL)))`
  );
}

/**
 * All live offers this session may see, with their merchants (offers are live from the moment they are published,
 * 3.9.1). sessionId null: the seed offers only (build ruling 44).
 */
export async function loadMatchOffers(db: Db, sessionId: string | null): Promise<MatchOffer[]> {
  const { rows } = await db.query<OfferRow>(
    `SELECT o.id, o.merchant_id, m.name AS merchant_name, m.location_lat AS lat, m.location_lng AS lng, o.category,
            o.valid_days, o.valid_start_time, o.valid_end_time
       FROM offers o JOIN merchants m ON m.id = o.merchant_id WHERE ${visibleOffersSql('o', 1)} ORDER BY o.id`,
    [sessionId],
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
    private readonly activity?: AgentActivity,
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
      await loadMatchOffers(this.db, sessionId),
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

    // Signs of life (build ruling 43): the run is in flight from here until its picks are saved.
    const reporter = this.activity?.begin(sessionId, appointmentId);
    try {
      return await this.chooseAndSave(sessionId, appointmentId, appt, match, reporter);
    } finally {
      reporter?.end();
    }
  }

  private async chooseAndSave(
    sessionId: string,
    appointmentId: string,
    appt: Awaited<ReturnType<AppointmentsService['get']>>,
    match: MatchResult,
    reporter: RunReporter | undefined,
  ): Promise<AppointmentPicks> {
    const result: ChooseResult = await this.chooser.choose({
      sessionId,
      appointment: {
        id: appt.id,
        // A stop an outside assistant handed over keeps its link title as data for the page only: the model never
        // reads it (build ruling 42).
        title: appt.added_by === 'assistant' ? ASSISTANT_STOP_TITLE_FOR_MODEL : appt.title,
        startsAt: appt.starts_at,
        endsAt: appt.ends_at,
        // ...and its place name likewise: the model is told the coordinates only (build ruling 47).
        locationText: appt.added_by === 'assistant' ? coordinatesText(appt.location_lat!, appt.location_lng!) : (appt.location_text ?? ''),
        lat: appt.location_lat!,
        lng: appt.location_lng!,
      },
      candidates: match.candidates,
      shown: match.shown,
      radiusMeters: match.radiusMeters,
      reporter,
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
