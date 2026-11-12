// The purchase flow (tasks 48, 28, 46, 100, 101, 29, 43, 49, 51, 52; REQ-03-01, REQ-03-07..REQ-03-12; spec 3.7).
// The only code that creates a PayPal order. It needs the confirmation token minted by the shopper's Yes tap; the
// amount is the offer's price_cents read from the offer store, never from the browser or the model.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Db, DbClient } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type { PaymentReturnResult, Receipt, StartPaymentResult } from '../../shared/types.js';
import { PAYMENT_FAILED_MESSAGE } from '../../shared/types.js';
import { ApiError, badRequest, notFound } from '../../api/http.js';
import { applyLazyTransitions } from '../proposals/lifecycle.js';
import { loadProposal } from '../proposals/proposalRows.js';
import { hashToken, looksLikeToken } from '../proposals/confirmationToken.js';
import type { PayPalAdapter } from '../paypal/paypalAdapter.js';
import { centsToDecimalString } from '../money/money.js';
import { generateRedemptionCode } from './redemptionCode.js';

const tokenRefused = () => new ApiError(403, 'confirmation_token_invalid', 'A valid confirmation token is required. Tap Yes again.');

interface PurchaseRow {
  id: string;
  proposal_id: string;
  offer_id: string;
  merchant_id: string;
  amount_cents: number;
  paypal_order_id: string;
  status: 'created' | 'approved' | 'completed' | 'failed';
  redemption_code: string | null;
  completed_at: Date | null;
}

export class PurchaseService {
  constructor(
    private readonly db: Db,
    private readonly paypal: PayPalAdapter,
    private readonly appBaseUrl: string,
    private readonly now: () => Date = () => new Date(),
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  /** POST /api/purchases: token gate, then the PayPal order from the stored price. */
  async start(sessionId: string, proposalId: string, token: unknown): Promise<StartPaymentResult> {
    const purchaseId = randomUUID();
    await applyLazyTransitions(this.db, this.now(), { sessionId, proposalId });
    const claim = await withTransaction(this.db, async (tx) => {
      const now = this.now();
      if (!(await loadProposal(tx, sessionId, proposalId, true))) throw notFound('No proposal exists with this id.');
      if (!looksLikeToken(token)) throw tokenRefused();
      const hash = hashToken(token);
      // Atomic claim: exactly one request can pass; bound to this proposal and this session; unexpired; unused.
      const claimed = await tx.query(
        `UPDATE proposals SET confirm_token_used_at = $4
          WHERE id = $1 AND session_id = $2 AND confirm_token_hash = $3
            AND confirm_token_used_at IS NULL AND confirm_token_expires_at > $4
          RETURNING id`,
        [proposalId, sessionId, hash, now],
      );
      if (claimed.rowCount !== 1) throw tokenRefused();
      await applyLazyTransitions(tx, now, { sessionId, proposalId });
      const p = (await loadProposal(tx, sessionId, proposalId))!;
      if (p.status !== 'accepted') throw badRequest(`This pick is ${p.status}; tap Yes again.`);
      // A removed offer starts no new payment; one already at PayPal still completes (build ruling 44).
      if (p.offer_removed_at) throw badRequest('The merchant removed this offer.');
      const inflight = await tx.query<PurchaseRow>(
        `SELECT * FROM purchases WHERE proposal_id = $1 AND status IN ('created','approved','completed') FOR UPDATE`,
        [proposalId],
      );
      if (inflight.rows.some((r) => r.status === 'completed')) throw badRequest('This pick is already bought.');
      if (inflight.rows.some((r) => r.status === 'approved')) throw badRequest('A payment for this pick is being completed.');
      // Back from PayPal without finishing, then Yes again: the abandoned order was never captured (build ruling 15(b)).
      await tx.query(`UPDATE purchases SET status = 'failed' WHERE proposal_id = $1 AND status = 'created'`, [proposalId]);
      return { p, hash };
    });

    const { p, hash } = claim;
    const amountCents = p.price_cents; // read from the offer store now (3.7.4); never from the browser or the model
    let order;
    try {
      order = await this.paypal.createOrder({
        requestId: purchaseId,
        proposalId,
        description: `${p.merchant_name}${p.merchant_is_sample ? ' [Sample]' : ''}: ${p.offer_title}`,
        amountValue: centsToDecimalString(amountCents),
        returnUrl: `${this.appBaseUrl}/pay/return?proposalId=${proposalId}`,
        cancelUrl: `${this.appBaseUrl}/pay/cancel?proposalId=${proposalId}`,
      });
    } catch (err) {
      // Release the claim so the shopper may retry until the token expires (api-contracts.md, purchases step 1).
      await this.db.query(`UPDATE proposals SET confirm_token_used_at = NULL WHERE id = $1 AND confirm_token_hash = $2`, [proposalId, hash]);
      this.log(`paypal: order creation failed for proposal ${proposalId}: ${(err as Error).message}`);
      throw new ApiError(500, 'internal_error', 'PayPal could not start the payment. Nothing was charged. Try again.');
    }
    await this.db.query(
      `INSERT INTO purchases (id, proposal_id, offer_id, merchant_id, amount_cents, paypal_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'created')`,
      [purchaseId, proposalId, p.offer_id, p.merchant_id, amountCents, order.orderId],
    );
    return { purchaseId, payerActionUrl: order.payerActionUrl };
  }

  private async latestPurchase(tx: DbClient, sessionId: string, proposalId: string): Promise<PurchaseRow> {
    if (!(await loadProposal(tx, sessionId, proposalId, true))) throw notFound('No proposal exists with this id.');
    const { rows } = await tx.query<PurchaseRow>(
      `SELECT * FROM purchases WHERE proposal_id = $1 ORDER BY (status = 'completed') DESC, created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [proposalId],
    );
    if (!rows[0]) throw notFound('No purchase exists for this pick.');
    return rows[0];
  }

  private failed(proposalId: string): PaymentReturnResult {
    return { outcome: 'failed', proposalId, message: PAYMENT_FAILED_MESSAGE };
  }

  async receipt(client: DbClient, purchaseId: string): Promise<Receipt> {
    const { rows } = await client.query(
      `SELECT u.id, u.amount_cents, u.redemption_code, u.completed_at, o.title, o.is_deposit, m.name, m.is_sample
         FROM purchases u JOIN offers o ON o.id = u.offer_id JOIN merchants m ON m.id = u.merchant_id WHERE u.id = $1`,
      [purchaseId],
    );
    const r = rows[0];
    return {
      purchaseId: r.id,
      merchantName: r.name,
      merchantIsSample: r.is_sample,
      offerTitle: r.title,
      amountCents: r.amount_cents,
      redemptionCode: r.redemption_code,
      isDeposit: r.is_deposit,
      completedAt: (r.completed_at as Date).toISOString(),
    };
  }

  /** POST /api/pay/return/{proposalId}: created -> approved, capture, completed or failed. A second return captures nothing. */
  async handleReturn(sessionId: string, proposalId: string): Promise<PaymentReturnResult> {
    const step = await withTransaction(this.db, async (tx) => {
      const u = await this.latestPurchase(tx, sessionId, proposalId);
      if (u.status === 'completed') return { done: { outcome: 'completed', proposalId, receipt: await this.receipt(tx, u.id) } as PaymentReturnResult };
      if (u.status === 'failed') return { done: this.failed(proposalId) };
      if (u.status === 'created') await tx.query(`UPDATE purchases SET status = 'approved' WHERE id = $1 AND status = 'created'`, [u.id]);
      // 'approved' already: a concurrent return or a crash mid-capture; capture again with the same PayPal-Request-Id (G-11).
      return { capture: u };
    });
    if ('done' in step && step.done) return step.done;
    const u = (step as { capture: PurchaseRow }).capture;

    let completed = false;
    let detail = '';
    try {
      const result = await this.paypal.captureOrder(u.paypal_order_id, `${u.id}-capture`);
      completed = result.completed;
      detail = `${result.orderStatus}/${result.captureStatus ?? '-'}`;
    } catch (err) {
      detail = `error: ${(err as Error).message}`;
    }

    if (completed) {
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const done = await withTransaction(this.db, async (tx) => {
            const upd = await tx.query(
              `UPDATE purchases SET status = 'completed', redemption_code = $2, completed_at = $3 WHERE id = $1 AND status = 'approved'`,
              [u.id, generateRedemptionCode(), this.now()],
            );
            if (upd.rowCount === 0) {
              const cur = await tx.query<PurchaseRow>('SELECT * FROM purchases WHERE id = $1', [u.id]);
              if (cur.rows[0].status !== 'completed') return this.failed(proposalId);
            }
            return { outcome: 'completed', proposalId, receipt: await this.receipt(tx, u.id) } as PaymentReturnResult;
          });
          return done;
        } catch (err) {
          if ((err as pg.DatabaseError).code === '23505') continue; // redemption code collision: draw again
          throw err;
        }
      }
      throw new ApiError(500, 'internal_error', 'Could not save the purchase.');
    }

    this.log(`paypal: capture not completed for purchase ${u.id} (${detail}); purchase failed, pick available again`);
    await withTransaction(this.db, async (tx) => {
      await tx.query(`UPDATE purchases SET status = 'failed' WHERE id = $1 AND status IN ('created','approved')`, [u.id]);
      await tx.query(`UPDATE proposals SET status = 'proposed' WHERE id = $1 AND status = 'accepted'`, [proposalId]);
    });
    return this.failed(proposalId);
  }

  /**
   * GET /api/proposals/{proposalId}/receipt (build ruling 38): the completed purchase's receipt, for this session only.
   * Read only — no PayPal call and no write. Not this session's proposal, or no completed purchase: 404.
   */
  async viewReceipt(sessionId: string, proposalId: string): Promise<Receipt> {
    if (!(await loadProposal(this.db, sessionId, proposalId))) throw notFound('No proposal exists with this id.');
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM purchases WHERE proposal_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      [proposalId],
    );
    if (!rows[0]) throw notFound('This pick has no completed purchase.');
    return this.receipt(this.db, rows[0].id);
  }

  /** POST /api/pay/cancel/{proposalId}: the purchase fails, the pick returns to proposed; a completed one is never undone. */
  async handleCancel(sessionId: string, proposalId: string): Promise<PaymentReturnResult> {
    return withTransaction(this.db, async (tx) => {
      const u = await this.latestPurchase(tx, sessionId, proposalId);
      if (u.status === 'completed') return { outcome: 'completed', proposalId, receipt: await this.receipt(tx, u.id) } as PaymentReturnResult;
      if (u.status === 'created' || u.status === 'approved') {
        await tx.query(`UPDATE purchases SET status = 'failed' WHERE id = $1 AND status IN ('created','approved')`, [u.id]);
        await tx.query(`UPDATE proposals SET status = 'proposed' WHERE id = $1 AND status = 'accepted'`, [proposalId]);
      }
      return this.failed(proposalId);
    });
  }
}
