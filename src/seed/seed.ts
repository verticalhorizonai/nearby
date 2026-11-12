// The seed (task 77; REQ-06-01; spec F7.1, 3.10): loads the eight sample merchants and their offers. Idempotent:
// running it again changes nothing and duplicates nothing (task 78). The demo calendar is the data module
// sampleData.ts, read by nearby-calendar-mcp (build ruling 15(d)). Proposals and purchases are never touched.
import type { Db } from '../models/db.js';
import { withTransaction } from '../models/db.js';
import { SAMPLE_MERCHANTS, SAMPLE_OFFERS } from './sampleData.js';

export async function seedSampleData(db: Db): Promise<{ merchants: number; offers: number }> {
  await withTransaction(db, async (tx) => {
    for (const m of SAMPLE_MERCHANTS) {
      await tx.query(
        `INSERT INTO merchants (id, name, type, area, location_lat, location_lng, is_sample) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, area = EXCLUDED.area,
           location_lat = EXCLUDED.location_lat, location_lng = EXCLUDED.location_lng, is_sample = TRUE`,
        [m.id, m.name, m.type, m.area, m.lat, m.lng],
      );
    }
    for (const o of SAMPLE_OFFERS) {
      await tx.query(
        `INSERT INTO offers (id, merchant_id, title, category, price_cents, regular_price_cents, valid_days, valid_start_time, valid_end_time, is_deposit, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, '2026-11-01T00:00:00Z')
         ON CONFLICT (id) DO UPDATE SET merchant_id = EXCLUDED.merchant_id, title = EXCLUDED.title, category = EXCLUDED.category,
           price_cents = EXCLUDED.price_cents, regular_price_cents = EXCLUDED.regular_price_cents, valid_days = EXCLUDED.valid_days,
           valid_start_time = EXCLUDED.valid_start_time, valid_end_time = EXCLUDED.valid_end_time, is_deposit = EXCLUDED.is_deposit,
           owner_session_id = NULL, removed_at = NULL, replaces_offer_id = NULL`, // a seed offer is shared and never removed (rulings 44, 45)
        [o.id, o.merchantId, o.title, o.category, o.priceCents, o.regularPriceCents, o.validDays, o.validStartTime, o.validEndTime, o.isDeposit],
      );
    }
  });
  const merchants = Number((await db.query('SELECT count(*) FROM merchants WHERE is_sample')).rows[0].count);
  const offers = Number((await db.query(`SELECT count(*) FROM offers WHERE id = ANY($1::uuid[])`, [SAMPLE_OFFERS.map((o) => o.id)])).rows[0].count);
  return { merchants, offers };
}
