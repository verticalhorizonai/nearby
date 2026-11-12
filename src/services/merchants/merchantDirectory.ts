// Merchant directory (task 213; REQ-04-01, REQ-04-02, REQ-04-04, REQ-04-05, REQ-05-03): the merchant list, the
// dashboard, publishing an offer, and the live sales feed. No login in the demo: any visitor may open any merchant.
// Build ruling 44: an offer posted through the demo belongs to the browser session that posted it. It is listed,
// matched and sold only in that session, and that session alone can remove or edit it. The eight seed offers stay
// shared and can be neither removed nor edited. Removing marks the row removed and never deletes it; an edit removes
// the old row the same way and inserts a new one, in one transaction.
import type { Db, DbClient } from '../../models/db.js';
import { withTransaction } from '../../models/db.js';
import type {
  ChooseSeatData,
  CreateOfferRequest,
  EditOfferResult,
  Merchant,
  MerchantDashboard,
  MerchantOffer,
  MerchantSeatCard,
  Offer,
  RemoveOfferResult,
  SalesFeed,
} from '../../shared/types.js';
import { OFFER_POSTS_PER_SESSION_PER_HOUR, SALES_FEED_MAX_ITEMS } from '../../shared/types.js';
import { ApiError, badRequest, notFound } from '../../api/http.js';
import { WindowLimiter } from '../offersMcp/windowLimiter.js';
import { visibleOffersSql } from '../picks/picksService.js';
import type { CalendarSource } from '../calendarMcp/client.js';
import { skipReason } from '../calendar/eventFilter.js';
import { DEMO_APPOINTMENT_COORDINATES } from '../../seed/sampleData.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const toMerchant = (r: any): Merchant => ({
  id: r.id, name: r.name, type: r.type, area: r.area, location: { lat: r.location_lat, lng: r.location_lng },
  isSample: r.is_sample, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
export const toOffer = (r: any): Offer => ({
  id: r.id, merchantId: r.merchant_id, title: r.title, priceCents: r.price_cents, regularPriceCents: r.regular_price_cents,
  category: r.category, validDays: r.valid_days, validStartTime: r.valid_start_time, validEndTime: r.valid_end_time,
  isDeposit: r.is_deposit, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const toMerchantOffer = (r: any, sessionId: string): MerchantOffer => ({ ...toOffer(r), postedByYou: r.owner_session_id !== null && r.owner_session_id === sessionId });
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SEED_OFFER_LOCKED = 'A sample offer stays as it is: only an offer you posted can be edited or removed.';

/**
 * Withdraws this session's open picks for an offer that is removed (build ruling 44): proposed, accepted and declined
 * picks end as expired, so none can be accepted or shown again. A pick with a payment already at PayPal (created or
 * approved) or a completed purchase is left as it is: that payment completes at the amount the shopper approved, and a
 * receipt stays a receipt.
 */
export async function withdrawOpenPicks(tx: DbClient, sessionId: string, offerId: string): Promise<number> {
  const r = await tx.query(
    `UPDATE proposals p SET status = 'expired'
      WHERE p.session_id = $1 AND p.offer_id = $2 AND p.status IN ('proposed', 'accepted', 'declined')
        AND NOT EXISTS (SELECT 1 FROM purchases u WHERE u.proposal_id = p.id AND u.status IN ('created', 'approved', 'completed'))`,
    [sessionId, offerId],
  );
  return r.rowCount ?? 0;
}

export class MerchantDirectory {
  /** Offers posted per session per hour; an edit counts as a post (build ruling 44). */
  private readonly posts: WindowLimiter;

  constructor(private readonly db: Db, private readonly calendar: CalendarSource, private readonly now: () => Date = () => new Date()) {
    this.posts = new WindowLimiter(OFFER_POSTS_PER_SESSION_PER_HOUR, 3_600_000, () => this.now().getTime());
  }

  private takePost(sessionId: string): void {
    if (!this.posts.take(sessionId)) {
      throw new ApiError(429, 'rate_limited', `At most ${OFFER_POSTS_PER_SESSION_PER_HOUR} offers an hour from one browser, edits included. Try again later.`);
    }
  }

  /** An offer of this merchant that this session posted and has not removed, locked for the change; else 404 or 400. */
  private async ownOffer(tx: DbClient, sessionId: string, merchantId: string, offerId: string) {
    const { rows } = await tx.query('SELECT * FROM offers WHERE id = $1 AND merchant_id = $2 FOR UPDATE', [offerId, merchantId]);
    const o = rows[0];
    if (!o || o.removed_at !== null) throw notFound('No offer of yours exists with this id.');
    if (o.owner_session_id === null) throw badRequest(SEED_OFFER_LOCKED);
    if (o.owner_session_id !== sessionId) throw notFound('No offer of yours exists with this id.');
    return o;
  }

  private async merchant(merchantId: string) {
    const { rows } = await this.db.query('SELECT * FROM merchants WHERE id = $1', [merchantId]);
    if (!rows[0]) throw notFound('No merchant exists with this id.');
    return rows[0];
  }

  /** GET /api/seats: the shopper's five appointment tiles and the eight sample merchant cards (3.11.1). */
  async seats(sessionId: string): Promise<ChooseSeatData> {
    const events = await this.calendar.listUpcomingAppointments();
    const usable = events.filter((e) => skipReason(e, DEMO_APPOINTMENT_COORDINATES[e.id] ?? null) === null);
    const known = await this.db.query<{ id: string; source_event_id: string }>(
      'SELECT id, source_event_id FROM appointments WHERE session_id = $1',
      [sessionId],
    );
    const idFor = new Map(known.rows.map((r) => [r.source_event_id, r.id]));
    const { rows } = await this.db.query(
      `SELECT m.id, m.name, m.is_sample, m.type, m.area, o.title, o.price_cents, o.is_deposit
         FROM merchants m
         JOIN LATERAL (SELECT title, price_cents, is_deposit FROM offers
                        WHERE merchant_id = m.id AND owner_session_id IS NULL AND removed_at IS NULL -- seed offers only (ruling 44)
                        ORDER BY created_at, id LIMIT 1) o ON TRUE
        ORDER BY m.id`,
    );
    const merchants: MerchantSeatCard[] = rows.map((r) => ({
      merchantId: r.id, name: r.name, isSample: r.is_sample, type: r.type, area: r.area, offerTitle: r.title, offerPriceCents: r.price_cents, offerIsDeposit: r.is_deposit,
    }));
    return {
      shopper: { appointments: usable.map((e) => ({ appointmentId: idFor.get(e.id) ?? e.id, title: e.title, startsAt: new Date(e.start).toISOString() })) },
      merchants,
    };
  }

  /** GET /api/merchants/{id}/dashboard: the profile card and the offers this session may see, newest first (ruling 44). */
  async dashboard(merchantId: string, sessionId: string): Promise<MerchantDashboard> {
    const m = await this.merchant(merchantId);
    const { rows } = await this.db.query(
      `SELECT * FROM offers o WHERE o.merchant_id = $1 AND ${visibleOffersSql('o', 2)} ORDER BY o.created_at DESC, o.id DESC`,
      [merchantId, sessionId],
    );
    return { merchant: toMerchant(m), offers: rows.map((r) => toMerchantOffer(r, sessionId)) };
  }

  private async insertOffer(tx: DbClient, merchantId: string, sessionId: string, req: CreateOfferRequest): Promise<MerchantOffer> {
    const { rows } = await tx.query(
      `INSERT INTO offers (merchant_id, title, category, price_cents, regular_price_cents, valid_days, valid_start_time, valid_end_time, is_deposit, created_at, owner_session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$10) RETURNING *`,
      [merchantId, req.title, req.category, req.priceCents, req.regularPriceCents ?? null, req.validDays, req.validStartTime, req.validEndTime, this.now(), sessionId],
    );
    return toMerchantOffer(rows[0], sessionId);
  }

  /**
   * POST /api/merchants/{id}/offers: live from the moment it is published (3.9.1), in the session that posted it
   * (build ruling 44). Input already validated.
   */
  async publishOffer(merchantId: string, sessionId: string, req: CreateOfferRequest): Promise<MerchantOffer> {
    await this.merchant(merchantId);
    this.takePost(sessionId);
    return this.insertOffer(this.db, merchantId, sessionId, req);
  }

  /** POST /api/merchants/{id}/offers/{offerId}/remove: marks the offer removed and withdraws this session's open picks. */
  async removeOffer(merchantId: string, sessionId: string, offerId: string): Promise<RemoveOfferResult> {
    await this.merchant(merchantId);
    return withTransaction(this.db, async (tx) => {
      await this.ownOffer(tx, sessionId, merchantId, offerId);
      await tx.query('UPDATE offers SET removed_at = $2 WHERE id = $1', [offerId, this.now()]);
      return { offerId, picksWithdrawn: await withdrawOpenPicks(tx, sessionId, offerId) };
    });
  }

  /**
   * POST /api/merchants/{id}/offers/{offerId}/edit: the old offer is removed exactly as Remove does and a new offer
   * with the edited fields is created, in one transaction. The old row is not changed otherwise, so past purchases,
   * receipts and sales keep its title and amount. Counts toward the posting limit. Input already validated.
   */
  async editOffer(merchantId: string, sessionId: string, offerId: string, req: CreateOfferRequest): Promise<EditOfferResult> {
    await this.merchant(merchantId);
    // The offer is checked before the limit is counted, so a refused edit (not yours, a sample) costs nothing.
    await withTransaction(this.db, (tx) => this.ownOffer(tx, sessionId, merchantId, offerId));
    this.takePost(sessionId);
    return withTransaction(this.db, async (tx) => {
      await this.ownOffer(tx, sessionId, merchantId, offerId);
      await tx.query('UPDATE offers SET removed_at = $2 WHERE id = $1', [offerId, this.now()]);
      const picksWithdrawn = await withdrawOpenPicks(tx, sessionId, offerId);
      const offer = await this.insertOffer(tx, merchantId, sessionId, req);
      return { offer, replacedOfferId: offerId, picksWithdrawn };
    });
  }

  /**
   * GET /api/merchants/{id}/sales-feed: the 20 most recent completed sales, newest first (3.8). A sale keeps the title
   * and amount it was made at, removed or replaced offer or not. Sales of an offer a session posted are in that
   * session's feed only, as the offer itself is (build ruling 44).
   */
  async salesFeed(merchantId: string, sessionId: string): Promise<SalesFeed> {
    await this.merchant(merchantId);
    const { rows } = await this.db.query(
      `SELECT u.id, o.title, u.amount_cents, u.completed_at, u.redemption_code
         FROM purchases u JOIN offers o ON o.id = u.offer_id
        WHERE u.merchant_id = $1 AND u.status = 'completed'
          AND (o.owner_session_id IS NULL OR o.owner_session_id = $3)
        ORDER BY u.completed_at DESC, u.id DESC LIMIT $2`,
      [merchantId, SALES_FEED_MAX_ITEMS, sessionId],
    );
    return {
      merchantId,
      items: rows.map((r) => ({ purchaseId: r.id, offerTitle: r.title, amountCents: r.amount_cents, completedAt: r.completed_at.toISOString(), redemptionCode: r.redemption_code })),
    };
  }
}
