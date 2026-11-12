// A posted offer belongs to the browser session that posted it (build ruling 44): seen, matched and handed over only
// there; never on /mcp or the seats. Remove marks it removed and withdraws this session's open picks; Edit removes the
// old offer the same way and creates a new one, in one transaction. Sales, receipts and a payment already at PayPal
// keep the old offer's title and amount. Seed offers can be neither removed nor edited. Reset removes posted offers.
// Migration 002 marks offers posted before offers had an owner as removed. A limit on posts per session per hour.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';
import { TEST_DATABASE_URL } from '../helpers/testDb.js';
import { createPool } from '../../src/models/db.js';
import { applySchema } from '../../src/models/schema/runner.js';
import { SAMPLE_MERCHANTS, SAMPLE_OFFERS } from '../../src/seed/sampleData.js';
import { OFFER_POSTS_PER_SESSION_PER_HOUR } from '../../src/shared/types.js';

type T = Awaited<ReturnType<typeof createTestApp>>;
const SAGUARO = SAMPLE_MERCHANTS[0].id; // at Old Main, beside the Tuesday 9:30 client meeting
const SEED_COFFEE = SAMPLE_OFFERS[0].id;
const OLD_MAIN = { lat: '32.2318', lng: '-110.9535' };
const TUE_0930 = '2026-11-17T09:30:00-07:00';
const WED_0930 = '2026-11-18T09:30:00-07:00';

const latte = (over: Record<string, unknown> = {}) => ({
  title: 'Poster latte', priceCents: 300, regularPriceCents: null, category: 'coffee',
  validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '07:00', validEndTime: '11:00', ...over,
});

async function mcpFind(t: T, starts_at: string) {
  const res = await t.app.inject({
    method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_offers_near', arguments: { lat: 32.2318, lng: -110.9535, starts_at } } },
  });
  return JSON.parse(res.body).result.structuredContent.offers as { offer_id: string }[];
}
async function mcpGet(t: T, offer_id: string) {
  const res = await t.app.inject({
    method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_offer', arguments: { offer_id } } },
  });
  return JSON.parse(res.body).result;
}

describe('posted offers belong to their session', () => {
  let t: T;
  const clientMeeting: Record<string, string> = {};
  const post = async (session: string, body = latte()) => t.request('POST', `/api/merchants/${SAGUARO}/offers`, body, {}, session);
  const meeting = async (session: string) => {
    if (!clientMeeting[session]) {
      await t.request('POST', '/api/calendar/demo-connection', {}, {}, session);
      const week = (await t.request('GET', '/api/appointments/upcoming', undefined, {}, session)).json.data;
      clientMeeting[session] = week.appointments.find((a: { title: string }) => a.title === 'Client meeting').id;
    }
    return clientMeeting[session];
  };
  const candidates = async (session: string) => {
    const { match } = await t.app.services.picks.candidatesFor(t.cookieJar[session], await meeting(session));
    return match.candidates.map((c) => c.offer.id);
  };
  const handoff = (session: string, offer: string, at = TUE_0930) => t.request('POST', '/api/handoff', { offer, ...OLD_MAIN, at }, {}, session);
  /** Accept, start the payment at PayPal and, unless `atPayPal`, come back approved: a completed purchase. */
  const buy = async (session: string, proposalId: string, atPayPal = false) => {
    const accept = await t.request('POST', `/api/proposals/${proposalId}/accept`, undefined, {}, session);
    expect(accept.status).toBe(200);
    const pay = await t.request('POST', '/api/purchases', { proposalId, confirmationToken: accept.json.data.confirmationToken }, {}, session);
    expect(pay.status).toBe(201);
    if (atPayPal) return null;
    const ret = await t.request('POST', `/api/pay/return/${proposalId}`, undefined, {}, session);
    expect(ret.json.data.outcome).toBe('completed');
    return ret.json.data.receipt;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t.close());

  it('is listed, matched and handed over in its own session only; never on /mcp or the seats', async () => {
    const r = await post('own');
    expect(r.status).toBe(201);
    const id = r.json.data.id;
    expect(r.json.data.postedByYou).toBe(true);

    const mine = (await t.request('GET', `/api/merchants/${SAGUARO}/dashboard`, undefined, {}, 'own')).json.data.offers;
    expect(mine.find((o: { id: string }) => o.id === id)).toMatchObject({ postedByYou: true });
    expect(mine.find((o: { id: string }) => o.id === SEED_COFFEE)).toMatchObject({ postedByYou: false });
    expect(await candidates('own')).toContain(id);
    expect((await t.request('GET', `/api/handoff?${new URLSearchParams({ offer: id, ...OLD_MAIN, at: TUE_0930 })}`, undefined, {}, 'own')).json.data.fits).toBe(true);

    const theirs = (await t.request('GET', `/api/merchants/${SAGUARO}/dashboard`, undefined, {}, 'other')).json.data.offers;
    expect(theirs.map((o: { id: string }) => o.id)).toEqual([SEED_COFFEE]);
    expect(await candidates('other')).not.toContain(id);
    expect((await t.request('GET', `/api/handoff?${new URLSearchParams({ offer: id, ...OLD_MAIN, at: TUE_0930 })}`, undefined, {}, 'other')).status).toBe(404);
    expect((await handoff('other', id)).status).toBe(404);

    expect((await mcpFind(t, TUE_0930)).map((o) => o.offer_id)).not.toContain(id);
    expect((await mcpGet(t, id)).isError).toBe(true);
    const seats = (await t.request('GET', '/api/seats', undefined, {}, 'own')).json.data.merchants;
    expect(seats.find((m: { merchantId: string }) => m.merchantId === SAGUARO)).toMatchObject({ offerTitle: 'Any drink plus pastry', offerPriceCents: 600 });
  });

  it('a seed offer can be neither removed nor edited', async () => {
    const remove = await t.request('POST', `/api/merchants/${SAGUARO}/offers/${SEED_COFFEE}/remove`, {}, {}, 'own');
    expect(remove.status).toBe(400);
    expect(remove.json.error.message).toMatch(/sample offer/);
    const edit = await t.request('POST', `/api/merchants/${SAGUARO}/offers/${SEED_COFFEE}/edit`, latte(), {}, 'own');
    expect(edit.status).toBe(400);
    const row = await t.db.query('SELECT title, price_cents::int AS p, removed_at, owner_session_id FROM offers WHERE id = $1', [SEED_COFFEE]);
    expect(row.rows[0]).toEqual({ title: 'Any drink plus pastry', p: 600, removed_at: null, owner_session_id: null });
  });

  it('another session can neither remove nor edit it, nor see it as its own', async () => {
    const id = (await post('owner2')).json.data.id;
    expect((await t.request('POST', `/api/merchants/${SAGUARO}/offers/${id}/remove`, {}, {}, 'intruder')).status).toBe(404);
    expect((await t.request('POST', `/api/merchants/${SAGUARO}/offers/${id}/edit`, latte({ title: 'Hijacked' }), {}, 'intruder')).status).toBe(404);
    const theirs = (await t.request('GET', `/api/merchants/${SAGUARO}/dashboard`, undefined, {}, 'intruder')).json.data.offers;
    expect(theirs.some((o: { id: string; postedByYou: boolean }) => o.id === id || o.postedByYou)).toBe(false);
    expect((await t.db.query('SELECT title, removed_at FROM offers WHERE id = $1', [id])).rows[0]).toEqual({ title: 'Poster latte', removed_at: null });
    expect((await t.request('POST', `/api/merchants/${SAGUARO}/offers/${id}/remove`, {}, { origin: 'https://evil.example' }, 'owner2')).status).toBe(403);
  });

  it('Remove withdraws the offer and its open picks; a completed purchase keeps its receipt and its sales feed row', async () => {
    const s = 'remover';
    const id = (await post(s)).json.data.id;
    const picks = (await t.request('GET', `/api/appointments/${await meeting(s)}/picks`, undefined, {}, s)).json.data.picks;
    const bought = picks.find((p: { offerId: string }) => p.offerId === id);
    const receipt = await buy(s, bought.proposalId);
    expect(receipt).toMatchObject({ offerTitle: 'Poster latte', amountCents: 300 });
    const open = (await handoff(s, id)).json.data.proposalId; // an open, proposed pick for it at another stop

    const r = await t.request('POST', `/api/merchants/${SAGUARO}/offers/${id}/remove`, {}, {}, s);
    expect(r.json.data).toEqual({ offerId: id, picksWithdrawn: 1 });
    expect((await t.db.query('SELECT status FROM proposals WHERE id = $1', [open])).rows[0].status).toBe('expired');
    expect((await t.request('POST', `/api/proposals/${open}/accept`, undefined, {}, s)).status).toBe(400);
    expect((await t.db.query('SELECT count(*)::int AS n FROM offers WHERE id = $1 AND removed_at IS NOT NULL', [id])).rows[0].n).toBe(1);

    const dash = (await t.request('GET', `/api/merchants/${SAGUARO}/dashboard`, undefined, {}, s)).json.data.offers;
    expect(dash.map((o: { id: string }) => o.id)).not.toContain(id);
    expect(await candidates(s)).not.toContain(id);
    const kept = await t.request('GET', `/api/proposals/${bought.proposalId}/receipt`, undefined, {}, s);
    expect(kept.json.data).toMatchObject({ offerTitle: 'Poster latte', amountCents: 300, redemptionCode: receipt.redemptionCode });
    const feed = (await t.request('GET', `/api/merchants/${SAGUARO}/sales-feed`, undefined, {}, s)).json.data.items;
    expect(feed[0]).toMatchObject({ offerTitle: 'Poster latte', amountCents: 300, redemptionCode: receipt.redemptionCode });
    // The sale of a posted offer is in its own session's feed only, as the offer is.
    const others = (await t.request('GET', `/api/merchants/${SAGUARO}/sales-feed`, undefined, {}, 'other')).json.data.items;
    expect(others.map((i: { redemptionCode: string }) => i.redemptionCode)).not.toContain(receipt.redemptionCode);
    // Removing it again finds nothing.
    expect((await t.request('POST', `/api/merchants/${SAGUARO}/offers/${id}/remove`, {}, {}, s)).status).toBe(404);
  });

  it('Edit replaces the offer: the old one is removed with its open picks, the new one is matched on its new terms, and past sales and a payment at PayPal keep the old title and amount', async () => {
    const s = 'editor';
    const oldId = (await post(s)).json.data.id;
    // A completed purchase of the old offer, one payment waiting at PayPal, and one open pick.
    const picks = (await t.request('GET', `/api/appointments/${await meeting(s)}/picks`, undefined, {}, s)).json.data.picks;
    const done = await buy(s, picks.find((p: { offerId: string }) => p.offerId === oldId).proposalId);
    const atPayPal = (await handoff(s, oldId)).json.data.proposalId;
    await buy(s, atPayPal, true);
    const open = (await handoff(s, oldId, '2026-11-19T09:30:00-07:00')).json.data.proposalId;

    const edit = await t.request('POST', `/api/merchants/${SAGUARO}/offers/${oldId}/edit`, latte({ title: 'Poster flat white', priceCents: 450, validDays: ['wed'] }), {}, s);
    expect(edit.status).toBe(201);
    const newId = edit.json.data.offer.id;
    expect(edit.json.data).toMatchObject({ replacedOfferId: oldId, picksWithdrawn: 1, offer: { title: 'Poster flat white', priceCents: 450, validDays: ['wed'], postedByYou: true } });
    expect(newId).not.toBe(oldId);
    const old = await t.db.query('SELECT title, price_cents::int AS p, removed_at FROM offers WHERE id = $1', [oldId]);
    expect(old.rows[0]).toMatchObject({ title: 'Poster latte', p: 300 });
    expect(old.rows[0].removed_at).not.toBeNull();
    expect((await t.db.query('SELECT status FROM proposals WHERE id = $1', [open])).rows[0].status).toBe('expired');

    // The new terms are matched (Wednesday only), the old offer is not.
    expect(await candidates(s)).not.toContain(oldId);
    expect(await candidates(s)).not.toContain(newId); // the client meeting is a Tuesday
    const wed = await t.request('GET', `/api/handoff?${new URLSearchParams({ offer: newId, ...OLD_MAIN, at: WED_0930 })}`, undefined, {}, s);
    expect(wed.json.data).toMatchObject({ fits: true, priceCents: 450, offerTitle: 'Poster flat white' });
    expect((await t.request('GET', `/api/handoff?${new URLSearchParams({ offer: oldId, ...OLD_MAIN, at: WED_0930 })}`, undefined, {}, s)).status).toBe(404);

    // The payment already at PayPal completes at the amount the shopper approved, with the old title.
    const ret = await t.request('POST', `/api/pay/return/${atPayPal}`, undefined, {}, s);
    expect(ret.json.data.outcome).toBe('completed');
    expect(ret.json.data.receipt).toMatchObject({ offerTitle: 'Poster latte', amountCents: 300 });
    // The earlier sale keeps its receipt and its feed row with the old title and amount.
    expect((await t.request('GET', `/api/proposals/${picks.find((p: { offerId: string }) => p.offerId === oldId).proposalId}/receipt`, undefined, {}, s)).json.data)
      .toMatchObject({ offerTitle: 'Poster latte', amountCents: 300, redemptionCode: done.redemptionCode });
    const feed = (await t.request('GET', `/api/merchants/${SAGUARO}/sales-feed`, undefined, {}, s)).json.data.items;
    expect(feed.filter((i: { offerTitle: string }) => i.offerTitle === 'Poster latte').map((i: { amountCents: number }) => i.amountCents)).toEqual([300, 300]);
    expect(feed.some((i: { offerTitle: string }) => i.offerTitle === 'Poster flat white')).toBe(false);

    // A replaced offer cannot be edited or removed again.
    expect((await t.request('POST', `/api/merchants/${SAGUARO}/offers/${oldId}/edit`, latte(), {}, s)).status).toBe(404);
    // An edit is checked like New offer.
    const bad = await t.request('POST', `/api/merchants/${SAGUARO}/offers/${newId}/edit`, latte({ title: '' }), {}, s);
    expect(bad.status).toBe(400);
    expect(bad.json.error.details.fieldErrors[0].field).toBe('title');
  });

  it('Reset demo removes the session’s posted offers', async () => {
    const s = 'resetter';
    const id = (await post(s)).json.data.id;
    const r = await t.request('POST', '/api/demo/reset', {}, {}, s);
    expect(r.json.data.postedOffersRemoved).toBe(1);
    const dash = (await t.request('GET', `/api/merchants/${SAGUARO}/dashboard`, undefined, {}, s)).json.data.offers;
    expect(dash.map((o: { id: string }) => o.id)).not.toContain(id);
    expect((await t.db.query('SELECT count(*)::int AS n FROM offers WHERE id = $1 AND removed_at IS NULL', [id])).rows[0].n).toBe(0);
  });
});

describe('the limit on posted offers', () => {
  it(`allows ${OFFER_POSTS_PER_SESSION_PER_HOUR} posts per session per hour, edits included`, async () => {
    const t = await createTestApp();
    try {
      const url = `/api/merchants/${SAGUARO}/offers`;
      const first = await t.request('POST', url, latte(), {}, 'busy');
      for (let i = 1; i < OFFER_POSTS_PER_SESSION_PER_HOUR - 1; i++) expect((await t.request('POST', url, latte(), {}, 'busy')).status).toBe(201);
      expect((await t.request('POST', `${url}/${first.json.data.id}/edit`, latte({ title: 'Edited' }), {}, 'busy')).status).toBe(201);
      const over = await t.request('POST', url, latte(), {}, 'busy');
      expect(over.status).toBe(429);
      expect(over.json.error.code).toBe('rate_limited');
      expect((await t.request('POST', url, latte(), {}, 'calm')).status).toBe(201);
    } finally {
      await t.close();
    }
  });
});

describe('migration 002', () => {
  it('names the seed offers exactly', () => {
    const sql = readFileSync('src/models/schema/migrations/002-offer-owner.sql', 'utf8');
    const ids = [...sql.matchAll(/'(0{8}-0000-4000-8000-0{9}1\d\d)'/g)].map((m) => m[1]).sort();
    expect(ids).toEqual(SAMPLE_OFFERS.map((o) => o.id).sort());
  });

  it('marks offers posted before offers had an owner as removed, keeps the seed offers, and is idempotent', async () => {
    const schema = `m_${randomBytes(6).toString('hex')}`;
    const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const db = createPool(TEST_DATABASE_URL, { options: `-c search_path=${schema},public`, max: 2 });
    try {
      // A database as it was before migration 002 (the app's schema without the two columns), with one seed offer and
      // one offer posted through the demo.
      await db.query(readFileSync('src/models/schema/schema.sql', 'utf8'));
      await db.query('ALTER TABLE offers DROP COLUMN owner_session_id, DROP COLUMN removed_at');
      const m = SAMPLE_MERCHANTS[0];
      await db.query('INSERT INTO merchants (id, name, type, area, location_lat, location_lng, is_sample) VALUES ($1,$2,$3,$4,$5,$6,TRUE)', [m.id, m.name, m.type, m.area, m.lat, m.lng]);
      const offer = (id: string | null, title: string) =>
        db.query(
          `INSERT INTO offers (${id ? 'id, ' : ''}merchant_id, title, category, price_cents, valid_days, valid_start_time, valid_end_time)
           VALUES (${id ? '$5, ' : ''}$1, $2, 'coffee', 600, $3, '07:00', $4) RETURNING id`,
          id ? [m.id, title, ['mon'], '11:00', id] : [m.id, title, ['mon'], '11:00'],
        );
      await offer(SEED_COFFEE, 'Any drink plus pastry');
      const legacy = (await offer(null, 'Posted before owners')).rows[0].id;

      await applySchema(db);
      const state = async () =>
        (await db.query('SELECT id, removed_at IS NOT NULL AS removed, owner_session_id FROM offers ORDER BY title')).rows;
      expect(await state()).toEqual([
        { id: SEED_COFFEE, removed: false, owner_session_id: null },
        { id: legacy, removed: true, owner_session_id: null },
      ]);
      // Applied again (every start), with an offer posted since: nothing changes.
      const owned = (await db.query(
        `INSERT INTO offers (merchant_id, title, category, price_cents, valid_days, valid_start_time, valid_end_time, owner_session_id)
         VALUES ($1, 'Owned since', 'coffee', 600, $2, '07:00', '11:00', 'session-x') RETURNING id`,
        [m.id, ['mon']],
      )).rows[0].id;
      await applySchema(db);
      await applySchema(db);
      expect(await state()).toEqual([
        { id: SEED_COFFEE, removed: false, owner_session_id: null },
        { id: owned, removed: false, owner_session_id: 'session-x' },
        { id: legacy, removed: true, owner_session_id: null },
      ]);
    } finally {
      await db.end();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`DROP SCHEMA ${schema} CASCADE`);
      await c.end();
    }
  });
});
