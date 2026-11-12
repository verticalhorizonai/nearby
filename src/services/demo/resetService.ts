// Reset demo (task 69; REQ-05-02; spec F6.2): removes this browser session's proposals and purchases, removes the stops
// an outside assistant handed over (build ruling 42) and the offers it posted (build ruling 44), and turns every
// appointment of the session back on, in one transaction. Sample data stays. Nothing is sent to PayPal.
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { ResetDemoResult } from '../../shared/types.js';

export async function resetDemo(db: Db, sessionId: string): Promise<ResetDemoResult> {
  return withTransaction(db, async (tx) => {
    const purchases = await tx.query('DELETE FROM purchases WHERE proposal_id IN (SELECT id FROM proposals WHERE session_id = $1)', [sessionId]);
    const proposals = await tx.query('DELETE FROM proposals WHERE session_id = $1', [sessionId]);
    const assistantStops = await tx.query("DELETE FROM appointments WHERE session_id = $1 AND added_by = 'assistant'", [sessionId]);
    // The session's posted offers (build ruling 44). With its own proposals and purchases gone, a posted offer no row
    // points at is deleted; one that another row still points at is marked removed instead, never deleted.
    const live = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM offers WHERE owner_session_id = $1 AND removed_at IS NULL', [sessionId]);
    await tx.query(
      `DELETE FROM offers o WHERE o.owner_session_id = $1
         AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.offer_id = o.id) AND NOT EXISTS (SELECT 1 FROM purchases u WHERE u.offer_id = o.id)`,
      [sessionId],
    );
    await tx.query('UPDATE offers SET removed_at = now() WHERE owner_session_id = $1 AND removed_at IS NULL', [sessionId]);
    const appts = await tx.query('UPDATE appointments SET enabled = TRUE WHERE session_id = $1 AND enabled = FALSE', [sessionId]);
    return {
      proposalsRemoved: proposals.rowCount ?? 0,
      purchasesRemoved: purchases.rowCount ?? 0,
      appointmentsReenabled: appts.rowCount ?? 0,
      assistantStopsRemoved: assistantStops.rowCount ?? 0,
      postedOffersRemoved: live.rows[0].n,
    };
  });
}
