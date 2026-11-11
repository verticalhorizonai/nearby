// Proposal and purchase lifecycles (task 53; REQ-03-12; spec 3.9.1 with ruling 7). Transitions are guarded UPDATEs
// (WHERE status = <from>), so a final state never changes. Expiry is lazy: it runs on every read of a proposal.
import type { DbClient } from '../../models/db.js';
import { PROPOSAL_EXPIRY_MS } from '../../shared/types.js';

/**
 * Lazy transitions for a session's proposals (optionally one proposal or one appointment):
 *  - proposed or accepted -> expired, PROPOSAL_EXPIRY_MS after created_at, unless a completed purchase exists (ruling 7);
 *  - accepted -> proposed when the confirmation token expired unused and no purchase came from it.
 */
export async function applyLazyTransitions(
  client: DbClient,
  now: Date,
  scope: { sessionId: string; proposalId?: string; appointmentId?: string },
): Promise<void> {
  const params: unknown[] = [scope.sessionId, now];
  let where = 'p.session_id = $1';
  if (scope.proposalId) {
    params.push(scope.proposalId);
    where += ` AND p.id = $${params.length}`;
  }
  if (scope.appointmentId) {
    params.push(scope.appointmentId);
    where += ` AND p.appointment_id = $${params.length}`;
  }
  params.push(PROPOSAL_EXPIRY_MS);
  const expiryParam = `$${params.length}`;
  await client.query(
    `UPDATE proposals p SET status = 'expired'
      WHERE ${where} AND p.status IN ('proposed','accepted')
        AND p.created_at <= $2::timestamptz - (${expiryParam}::bigint * interval '1 millisecond')
        AND NOT EXISTS (SELECT 1 FROM purchases u WHERE u.proposal_id = p.id AND u.status = 'completed')`,
    params,
  );
  await client.query(
    `UPDATE proposals p SET status = 'proposed', confirm_token_hash = NULL, confirm_token_expires_at = NULL, confirm_token_used_at = NULL
      WHERE ${where} AND p.status = 'accepted'
        AND p.confirm_token_expires_at IS NOT NULL AND p.confirm_token_expires_at <= $2
        AND p.confirm_token_used_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM purchases u WHERE u.proposal_id = p.id AND u.status IN ('created','approved','completed'))`,
    params.slice(0, params.length - 1),
  );
}
