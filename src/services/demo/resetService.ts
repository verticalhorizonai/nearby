// Reset demo (task 69; REQ-05-02; spec F6.2): removes this browser session's proposals and purchases, removes the stops
// an outside assistant handed over (build ruling 42), and turns every appointment of the session back on, in one
// transaction. Sample data stays. Nothing is sent to PayPal.
import type { Db } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { ResetDemoResult } from '../../shared/types.js';

export async function resetDemo(db: Db, sessionId: string): Promise<ResetDemoResult> {
  return withTransaction(db, async (tx) => {
    const purchases = await tx.query('DELETE FROM purchases WHERE proposal_id IN (SELECT id FROM proposals WHERE session_id = $1)', [sessionId]);
    const proposals = await tx.query('DELETE FROM proposals WHERE session_id = $1', [sessionId]);
    const assistantStops = await tx.query("DELETE FROM appointments WHERE session_id = $1 AND added_by = 'assistant'", [sessionId]);
    const appts = await tx.query('UPDATE appointments SET enabled = TRUE WHERE session_id = $1 AND enabled = FALSE', [sessionId]);
    return {
      proposalsRemoved: proposals.rowCount ?? 0,
      purchasesRemoved: purchases.rowCount ?? 0,
      appointmentsReenabled: appts.rowCount ?? 0,
      assistantStopsRemoved: assistantStops.rowCount ?? 0,
    };
  });
}
