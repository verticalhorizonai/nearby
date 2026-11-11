// Tap Yes and tap Not now (tasks 53, 31, 45; REQ-03-01, REQ-03-02, REQ-03-08, REQ-03-12). Called only from the
// shopper's taps through POST /api/proposals/{id}/accept and /decline; never exposed to the agent.
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { AcceptProposalResult, Proposal } from '../../shared/types.js';
import { badRequest, notFound } from '../../api/http.js';
import { applyLazyTransitions } from './lifecycle.js';
import { loadProposal, toConfirmSheet, toProposal } from './proposalRows.js';
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
      const { token, hash, expiresAt } = mintToken(now);
      await tx.query(
        `UPDATE proposals SET status = 'accepted', confirm_token_hash = $3, confirm_token_expires_at = $4, confirm_token_used_at = NULL
          WHERE id = $1 AND session_id = $2 AND status IN ('proposed','accepted')`,
        [proposalId, sessionId, hash, expiresAt],
      );
      return { confirmSheet: toConfirmSheet(p), confirmationToken: token, confirmationTokenExpiresAt: expiresAt.toISOString() };
    });
  }

  /** proposed -> declined (final). A repeat decline is idempotent; accepted or expired is refused. */
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
