// Seats, merchant dashboard, offers, the live sales feed, and Reset demo (REQ-04-01..05, REQ-05-02, REQ-05-03, REQ-06-01).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';
import { SAMPLE_MERCHANTS } from '../../src/seed/sampleData.js';
import { seedSampleData } from '../../src/seed/seed.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
const saguaro = SAMPLE_MERCHANTS[0].id;
beforeAll(async () => { t = await createTestApp(); });
afterAll(async () => { await t.close(); });

async function buy(title: string, session = 'a') {
  await t.request('POST', '/api/calendar/demo-connection', undefined, {}, session);
  const list = await t.request('GET', '/api/appointments/upcoming', undefined, {}, session);
  const id = list.json.data.appointments.find((a: { title: string }) => a.title === title).id;
  const picks = await t.request('GET', `/api/appointments/${id}/picks`, undefined, {}, session);
  const proposalId = picks.json.data.picks[0].proposalId;
  const token = (await t.request('POST', `/api/proposals/${proposalId}/accept`, undefined, {}, session)).json.data.confirmationToken;
  await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token }, {}, session);
  return (await t.request('POST', `/api/pay/return/${proposalId}`, undefined, {}, session)).json.data;
}

describe('seats and the merchant dashboard', () => {
  it('Choose a seat: five appointment tiles and the eight sample merchants with their seeded offers', async () => {
    const r = await t.request('GET', '/api/seats');
    expect(r.json.data.shopper.appointments.map((a: { title: string }) => a.title)).toEqual(['Client meeting', 'Lunch with a partner', 'Workshop', 'Print pickup', 'Dinner']);
    expect(r.json.data.merchants).toHaveLength(8);
    expect(r.json.data.merchants[0]).toMatchObject({ name: 'Saguaro Bean Co.', isSample: true, type: 'Coffee shop', area: 'near the university', offerTitle: 'Any drink plus pastry', offerPriceCents: 600 });
    expect(r.json.data.merchants.every((m: { isSample: boolean }) => m.isSample)).toBe(true);
  });
  it('the dashboard shows the profile and the offers; an unknown merchant is 404', async () => {
    const r = await t.request('GET', `/api/merchants/${saguaro}/dashboard`);
    expect(r.json.data.merchant).toMatchObject({ name: 'Saguaro Bean Co.', type: 'Coffee shop', area: 'near the university', location: { lat: 32.2319, lng: -110.9501 }, isSample: true });
    expect(r.json.data.offers).toHaveLength(1);
    expect((await t.request('GET', '/api/merchants/00000000-0000-4000-8000-000000000999/dashboard')).status).toBe(404);
  });
  it('the seed is idempotent', async () => {
    await seedSampleData(t.db);
    expect((await t.db.query('SELECT count(*)::int AS n FROM merchants')).rows[0].n).toBe(8);
    expect((await t.db.query('SELECT count(*)::int AS n FROM offers')).rows[0].n).toBe(8);
  });
});

describe('posting an offer', () => {
  it('publishes a valid offer live at once, newest first; it becomes a candidate', async () => {
    const r = await t.request('POST', `/api/merchants/${saguaro}/offers`, { title: 'Cold brew', priceCents: 450, regularPriceCents: 500, category: 'coffee', validDays: ['tue'], validStartTime: '08:00', validEndTime: '10:00' });
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ title: 'Cold brew', priceCents: 450, regularPriceCents: 500, isDeposit: false });
    const d = await t.request('GET', `/api/merchants/${saguaro}/dashboard`);
    expect(d.json.data.offers[0].title).toBe('Cold brew');
  });
  it('refuses a broken form with a message beside each field and saves nothing', async () => {
    const before = (await t.db.query('SELECT count(*)::int AS n FROM offers')).rows[0].n;
    const r = await t.request('POST', `/api/merchants/${saguaro}/offers`, { title: '', priceCents: 50001, regularPriceCents: 'ten', category: 'x', validDays: [], validStartTime: '12:00', validEndTime: '11:00' });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('validation_error');
    expect(r.json.error.details.fieldErrors.map((e: { field: string }) => e.field).sort()).toEqual(['category', 'priceCents', 'regularPriceCents', 'title', 'validDays', 'validEndTime']);
    expect((await t.db.query('SELECT count(*)::int AS n FROM offers')).rows[0].n).toBe(before);
  });
});

describe('the live sales feed and Reset demo', () => {
  it('a completed purchase is items[0] of the merchant’s feed at once (polled every 3 s, so within 5 s)', async () => {
    const ret = await buy('Client meeting');
    expect(ret.outcome).toBe('completed');
    const feed = await t.request('GET', `/api/merchants/${saguaro}/sales-feed`);
    expect(feed.res.headers['cache-control']).toBe('no-store');
    expect(feed.json.data.items[0]).toMatchObject({ offerTitle: 'Any drink plus pastry', amountCents: 600, redemptionCode: ret.receipt.redemptionCode });
  });
  it('holds the 20 most recent sales, newest first', async () => {
    const { rows } = await t.db.query(`SELECT appointment_id, offer_id, merchant_id FROM proposals WHERE merchant_id = $1 LIMIT 1`, [saguaro]);
    const base = Date.parse('2026-11-16T15:00:00Z');
    for (let i = 0; i < 25; i++) {
      const p = await t.db.query(
        `INSERT INTO proposals (session_id, appointment_id, offer_id, merchant_id, rank, score, reason, distance_meters, source, status)
         VALUES ('bulk', $1, $2, $3, 1, 0.9, 'r', 1, 'fallback', 'accepted') RETURNING id`, [rows[0].appointment_id, rows[0].offer_id, rows[0].merchant_id]);
      await t.db.query(
        `INSERT INTO purchases (proposal_id, offer_id, merchant_id, amount_cents, paypal_order_id, status, redemption_code, completed_at)
         VALUES ($1,$2,$3,600,$4,'completed',$5,$6)`,
        [p.rows[0].id, rows[0].offer_id, rows[0].merchant_id, `BULK${i}`, `B${String(i).padStart(2, '0').replace(/0/g, 'Z').replace(/1/g, 'Y')}AAA`.slice(0, 6), new Date(base + i * 60_000)]);
    }
    const feed = await t.request('GET', `/api/merchants/${saguaro}/sales-feed`);
    expect(feed.json.data.items).toHaveLength(20);
    const times = feed.json.data.items.map((i: { completedAt: string }) => i.completedAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(times[0]).toBe(new Date(base + 24 * 60_000).toISOString());
  });
  it('Reset demo removes this session’s proposals and purchases, turns appointments back on, keeps sample data, touches no other session', async () => {
    await buy('Dinner', 'other');
    const list = await t.request('GET', '/api/appointments/upcoming');
    await t.request('PATCH', `/api/appointments/${list.json.data.appointments[1].id}`, { enabled: false });
    const calls = t.paypalTransport.calls.length;
    const r = await t.request('POST', '/api/demo/reset', {});
    expect(r.json.data.appointmentsReenabled).toBe(1);
    expect(r.json.data.proposalsRemoved).toBeGreaterThan(0);
    expect(t.paypalTransport.calls.length).toBe(calls);
    expect((await t.request('POST', '/api/demo/reset', {})).json.data).toEqual({ proposalsRemoved: 0, purchasesRemoved: 0, appointmentsReenabled: 0 });
    expect((await t.db.query('SELECT count(*)::int AS n FROM merchants')).rows[0].n).toBe(8);
    const otherFeed = await t.request('GET', `/api/merchants/${SAMPLE_MERCHANTS[5].id}/sales-feed`);
    expect(otherFeed.json.data.items).toHaveLength(1);
    expect((await t.request('POST', '/api/demo/reset', {}, { origin: 'https://evil.example' })).status).toBe(403);
  });
});
