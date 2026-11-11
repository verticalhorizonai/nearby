// Merchant directory (task 213; REQ-04-01, REQ-04-02, REQ-04-04, REQ-04-05, REQ-05-03): the merchant list, the
// dashboard, publishing an offer, and the live sales feed. No login in the demo: any visitor may open any merchant.
import type { Db } from '../../models/db.js';
import type { ChooseSeatData, CreateOfferRequest, Merchant, MerchantDashboard, MerchantSeatCard, Offer, SalesFeed } from '../../shared/types.js';
import { SALES_FEED_MAX_ITEMS } from '../../shared/types.js';
import { notFound } from '../../api/http.js';
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
/* eslint-enable @typescript-eslint/no-explicit-any */

export class MerchantDirectory {
  constructor(private readonly db: Db, private readonly calendar: CalendarSource, private readonly now: () => Date = () => new Date()) {}

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
         JOIN LATERAL (SELECT title, price_cents, is_deposit FROM offers WHERE merchant_id = m.id ORDER BY created_at, id LIMIT 1) o ON TRUE
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

  /** GET /api/merchants/{id}/dashboard: the profile card and the offers list, newest first. */
  async dashboard(merchantId: string): Promise<MerchantDashboard> {
    const m = await this.merchant(merchantId);
    const { rows } = await this.db.query('SELECT * FROM offers WHERE merchant_id = $1 ORDER BY created_at DESC, id DESC', [merchantId]);
    return { merchant: toMerchant(m), offers: rows.map(toOffer) };
  }

  /** POST /api/merchants/{id}/offers: live from the moment it is published (3.9.1). Input already validated. */
  async publishOffer(merchantId: string, req: CreateOfferRequest): Promise<Offer> {
    await this.merchant(merchantId);
    const { rows } = await this.db.query(
      `INSERT INTO offers (merchant_id, title, category, price_cents, regular_price_cents, valid_days, valid_start_time, valid_end_time, is_deposit, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9) RETURNING *`,
      [merchantId, req.title, req.category, req.priceCents, req.regularPriceCents ?? null, req.validDays, req.validStartTime, req.validEndTime, this.now()],
    );
    return toOffer(rows[0]);
  }

  /** GET /api/merchants/{id}/sales-feed: the 20 most recent completed sales, newest first (3.8). */
  async salesFeed(merchantId: string): Promise<SalesFeed> {
    await this.merchant(merchantId);
    const { rows } = await this.db.query(
      `SELECT u.id, o.title, u.amount_cents, u.completed_at, u.redemption_code
         FROM purchases u JOIN offers o ON o.id = u.offer_id
        WHERE u.merchant_id = $1 AND u.status = 'completed'
        ORDER BY u.completed_at DESC, u.id DESC LIMIT $2`,
      [merchantId, SALES_FEED_MAX_ITEMS],
    );
    return {
      merchantId,
      items: rows.map((r) => ({ purchaseId: r.id, offerTitle: r.title, amountCents: r.amount_cents, completedAt: r.completed_at.toISOString(), redemptionCode: r.redemption_code })),
    };
  }
}
