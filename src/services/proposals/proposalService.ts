// Tap Yes and tap Not now (tasks 53, 31, 45; REQ-03-01, REQ-03-02, REQ-03-08, REQ-03-12). Called only from the
// shopper's taps through POST /api/proposals/{id}/accept and /decline; never exposed to the agent.
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { AcceptProposalResult, Proposal, RestoreHiddenPicksResult } from '../../shared/types.js';
import { PROPOSAL_EXPIRY_MS } from '../../shared/types.js';
import { badRequest, notFound } from '../../api/http.js';
import { applyLazyTransitions } from './lifecycle.js';
import { loadAppointmentProposals, loadProposal, toConfirmSheet, toPick, toProposal } from './proposalRows.js';
import { mintToken } from './confirmationToken.js';

export class ProposalService {
  constructor(private readonly db: Db, private readonly now: () => Date = () => new Date()) {}

  /** proposed -> accepted (or accepted stays accepted with a fresh token); declined or expired is refused. */
  async accept(sessionId: string, proposalId: string): Promise<AcceptProposalResult> {
    // Lazy expiry runs first and is kept even when the request is then refused (REQ-03-12).
    await applyLazyTransitions(this.db, this.now(), { sessionId, proposalId });
    return withTransaction(this.db, async (tx) => {
      const now = this.now();
      if (!(await loadProposal(tx, sessionId, proposalId, true))) throw notFound('No proposal exists with this id.');
      await applyLazyTransitions(tx, now, { sessionId, proposalId });
      const p = (await loadProposal(tx, sessionId, proposalId))!;
      if (p.status === 'declined' || p.status === 'expired') throw badRequest(`This pick is ${p.status} and cannot be accepted.`);
      if (p.offer_removed_at) throw badRequest('The merchant removed this offer.'); // build ruling 44
      const { token, hash, expiresAt } = mintToken(now);
      await tx.query(
        `UPDATE proposals SET status = 'accepted', confirm_token_hash = $3, confirm_token_expires_at = $4, confirm_token_used_at = NULL
          WHERE id = $1 AND session_id = $2 AND status IN ('proposed','accepted')`,
        [proposalId, sessionId, hash, expiresAt],
      );
      return { confirmSheet: toConfirmSheet(p), confirmationToken: token, confirmationTokenExpiresAt: expiresAt.toISOString() };
    });
  }

  /**
   * POST /api/appointments/{appointmentId}/picks/restore (build ruling 40): declined -> proposed for this session's
   * picks of the appointment that have not expired (expiry is 3 hours after creation, whatever happened in between).
   * Idempotent. Proposed, accepted and bought picks are untouched; no agent run, no rate-limit count, no outside call.
   */
  async restoreDeclined(sessionId: string, appointmentId: string): Promise<RestoreHiddenPicksResult> {
    const appt = await this.db.query('SELECT 1 FROM appointments WHERE id = $1 AND session_id = $2 AND skip_reason IS NULL', [appointmentId, sessionId]);
    if (!appt.rows[0]) throw notFound('No appointment exists with this id.');
    const now = this.now();
    await applyLazyTransitions(this.db, now, { sessionId, appointmentId });
    const restored = await this.db.query(
      `UPDATE proposals SET status = 'proposed'
        WHERE session_id = $1 AND appointment_id = $2 AND status = 'declined'
          AND created_at > $3::timestamptz - ($4::bigint * interval '1 millisecond')`,
      [sessionId, appointmentId, now, PROPOSAL_EXPIRY_MS],
    );
    const picks = await loadAppointmentProposals(this.db, sessionId, appointmentId);
    return { appointmentId, picks: picks.map(toPick), noMatch: false, restored: restored.rowCount ?? 0 };
  }

  /** proposed -> declined. A repeat decline is idempotent; accepted or expired is refused (ruling 40: declined can return). */
  async decline(sessionId: string, proposalId: string): Promise<Proposal> {
    await applyLazyTransitions(this.db, this.now(), { sessionId, proposalId });
    return withTransaction(this.db, async (tx) => {
      if (!(await loadProposal(tx, sessionId, proposalId, true))) throw notFound('No proposal exists with this id.');
      await applyLazyTransitions(tx, this.now(), { sessionId, proposalId });
      const p = (await loadProposal(tx, sessionId, proposalId))!;
      if (p.status === 'declined') return toProposal(p);
      if (p.status !== 'proposed') throw badRequest(`This pick is ${p.status} and cannot be declined.`);
      await tx.query(`UPDATE proposals SET status = 'declined' WHERE id = $1 AND session_id = $2 AND status = 'proposed'`, [proposalId, sessionId]);
      return toProposal((await loadProposal(tx, sessionId, proposalId))!);
    });
  }
}
