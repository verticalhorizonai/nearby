// The purchase flow end to end against the recorded PayPal fixtures: picks, Yes, Pay, return, a second return,
// cancel, failed capture, and every refusal of the token gate (REQ-03-01, REQ-03-02, REQ-03-07..12; spec 3.7.4).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';
import paypalVariants from '../../src/services/adapters/fixtures/paypal-variants.json' with { type: 'json' };
import type { Fixture } from '../../src/services/adapters/transport.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
let ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp();
  await t.request('POST', '/api/calendar/demo-connection');
  const list = await t.request('GET', '/api/appointments/upcoming');
  ids = Object.fromEntries(list.json.data.appointments.map((a: { title: string; id: string }) => [a.title, a.id]));
});
afterAll(async () => { await t.close(); });
beforeEach(async () => {
  await t.db.query('DELETE FROM purchases');
  await t.db.query('DELETE FROM proposals');
  t.paypalTransport.calls.length = 0;
});

const picksFor = async (title: string, session = 'a') => (await t.request('GET', `/api/appointments/${ids[title]}/picks`, undefined, {}, session)).json.data;
async function acceptFirst(title = 'Client meeting') {
  const picks = await picksFor(title);
  const proposalId = picks.picks[0].proposalId as string;
  const acc = await t.request('POST', `/api/proposals/${proposalId}/accept`);
  return { proposalId, token: acc.json.data.confirmationToken as string, acc };
}

describe('picks (fallback path, no model configured)', () => {
  it('Tue 9:30: Saguaro Bean then Sonoran Print, scores 0.90 and 0.41, template reasons; repeat reads are stable', async () => {
    const d = await picksFor('Client meeting');
    expect(d.noMatch).toBe(false);
    expect(d.picks.map((p: { merchantName: string; score: number }) => [p.merchantName, p.score])).toEqual([['Saguaro Bean Co.', 0.9], ['Sonoran Print Shop', 0.41]]);
    expect(d.picks[0]).toMatchObject({ source: 'fallback', status: 'proposed', priceCents: 600, merchantIsSample: true });
    expect(d.picks[0].reason).toBe('Saguaro Bean Co. is 0.2 mi from your 9:30 and the deal runs 7:00 to 11:00 AM.');
    const again = await picksFor('Client meeting');
    expect(again.picks.map((p: { proposalId: string }) => p.proposalId)).toEqual(d.picks.map((p: { proposalId: string }) => p.proposalId));
  });
  it('another session cannot see or act on this session’s picks', async () => {
    const d = await picksFor('Client meeting');
    const other = await t.request('POST', `/api/proposals/${d.picks[0].proposalId}/accept`, undefined, {}, 'b');
    expect(other.status).toBe(404);
    expect((await t.request('GET', `/api/appointments/${ids['Client meeting']}/picks`, undefined, {}, 'b')).status).toBe(404);
  });
});

describe('Yes, Pay, return: one purchase from Yes to the receipt', () => {
  it('creates the order from the stored price and captures on return; a second return captures nothing', async () => {
    const { proposalId, token, acc } = await acceptFirst();
    expect(acc.json.data.confirmSheet).toMatchObject({ merchantName: 'Saguaro Bean Co.', merchantIsSample: true, offerTitle: 'Any drink plus pastry', priceCents: 600 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await t.db.query('SELECT status, confirm_token_hash FROM proposals WHERE id = $1', [proposalId]);
    expect(stored.rows[0].status).toBe('accepted');
    expect(stored.rows[0].confirm_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0].confirm_token_hash).not.toContain(token);

    const pay = await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token, amountCents: 1, priceCents: 1 });
    expect(pay.status).toBe(201);
    expect(pay.json.data.payerActionUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=5O190127TN36\d{4}$/);
    const order = t.paypalTransport.calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    const body = JSON.parse(order.body!);
    expect(body).toEqual({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: proposalId, description: 'Saguaro Bean Co. [Sample]: Any drink plus pastry', amount: { currency_code: 'USD', value: '6.00' } }],
      payment_source: { paypal: { experience_context: { return_url: `http://localhost:3000/pay/return?proposalId=${proposalId}`, cancel_url: `http://localhost:3000/pay/cancel?proposalId=${proposalId}`, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' } } },
    });
    expect(order.headers['PayPal-Request-Id']).toBe(pay.json.data.purchaseId);
    expect(order.url.startsWith('https://api-m.sandbox.paypal.com')).toBe(true);

    const ret = await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(ret.json.data.outcome).toBe('completed');
    expect(ret.json.data.receipt).toMatchObject({ merchantName: 'Saguaro Bean Co.', amountCents: 600, isDeposit: false });
    expect(ret.json.data.receipt.redemptionCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const captures = () => t.paypalTransport.calls.filter((c) => c.url.endsWith('/capture')).length;
    expect(captures()).toBe(1);
    const second = await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(second.json.data).toEqual(ret.json.data);
    expect(captures()).toBe(1);
    const stale = await t.request('POST', `/api/pay/cancel/${proposalId}`);
    expect(stale.json.data.outcome).toBe('completed');
    const p = await t.db.query('SELECT u.status AS ps, p.status FROM purchases u JOIN proposals p ON p.id = u.proposal_id');
    expect(p.rows).toEqual([{ ps: 'completed', status: 'accepted' }]);
  });

  it('the OAuth token is fetched once and reused', async () => {
    const tokenCalls = t.paypalTransport.calls.filter((c) => c.url.endsWith('/v1/oauth2/token')).length;
    const { proposalId, token } = await acceptFirst('Lunch with a partner');
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    expect(t.paypalTransport.calls.filter((c) => c.url.endsWith('/v1/oauth2/token')).length).toBe(tokenCalls);
  });

  it('the Noodle Bar deposit charges $1.50 and the receipt says redeem in store', async () => {
    const { proposalId, token } = await acceptFirst('Lunch with a partner');
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    const order = t.paypalTransport.calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    expect(JSON.parse(order.body!).purchase_units[0].amount.value).toBe('1.50');
    const ret = await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(ret.json.data.receipt).toMatchObject({ amountCents: 150, isDeposit: true });
  });

  it('a bought offer is not offered again for the same appointment', async () => {
    const { proposalId, token } = await acceptFirst();
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    await t.request('POST', `/api/pay/return/${proposalId}`);
    await t.db.query(`UPDATE proposals SET created_at = created_at - interval '4 hours'`); // make room for a new run
    await t.db.query(`UPDATE proposals SET status = 'expired' WHERE status = 'proposed'`);
    await t.db.query(`DELETE FROM proposals WHERE status = 'accepted' AND id <> $1`, [proposalId]);
    // The bought proposal does not expire (ruling 7), so the old generation remains; remove it from view by expiring its sibling only.
    const d = await picksFor('Client meeting');
    expect(d.picks.map((p: { merchantName: string }) => p.merchantName)).toContain('Saguaro Bean Co.'); // the bought pick stays bought
    expect(d.picks.find((p: { proposalId: string }) => p.proposalId === proposalId)).toMatchObject({ status: 'accepted', purchased: true });
    const bought = await t.db.query('SELECT status FROM proposals WHERE id = $1', [proposalId]);
    expect(bought.rows[0].status).toBe('accepted');
  });
});

describe('picks bought per stop on My week (build ruling 36)', () => {
  const bought = async (title: string) =>
    (await t.request('GET', '/api/appointments/upcoming')).json.data.appointments.find((a: { title: string }) => a.title === title).boughtCount;

  it('0 with no purchase; a cancelled or failed one does not count; 1 after a completed purchase; 0 after Reset demo', async () => {
    expect(await bought('Client meeting')).toBe(0);
    // cancelled at PayPal
    const first = await acceptFirst();
    const proposalId = first.proposalId;
    let token = first.token;
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    await t.request('POST', `/api/pay/cancel/${proposalId}`);
    expect(await bought('Client meeting')).toBe(0);
    // capture not COMPLETED: failed
    token = (await t.request('POST', `/api/proposals/${proposalId}/accept`)).json.data.confirmationToken;
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    t.paypalTransport.queue((paypalVariants as Fixture[])[0]);
    await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(await bought('Client meeting')).toBe(0);
    // created but not yet returned from PayPal
    token = (await t.request('POST', `/api/proposals/${proposalId}/accept`)).json.data.confirmationToken;
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    expect(await bought('Client meeting')).toBe(0);
    // completed
    await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(await bought('Client meeting')).toBe(1);
    expect(await bought('Lunch with a partner')).toBe(0);
    // another session sees its own count only
    await t.request('POST', '/api/calendar/demo-connection', undefined, {}, 'b');
    const other = await t.request('GET', '/api/appointments/upcoming', undefined, {}, 'b');
    expect(other.json.data.appointments.every((a: { boughtCount: number }) => a.boughtCount === 0)).toBe(true);
    // Reset demo
    await t.request('POST', '/api/demo/reset', {});
    expect(await bought('Client meeting')).toBe(0);
  });

  it('2 when both picks of a stop are bought', async () => {
    const d = await picksFor('Client meeting');
    for (const p of d.picks) {
      const token = (await t.request('POST', `/api/proposals/${p.proposalId}/accept`)).json.data.confirmationToken;
      await t.request('POST', '/api/purchases', { proposalId: p.proposalId, confirmationToken: token });
      await t.request('POST', `/api/pay/return/${p.proposalId}`);
    }
    expect(await bought('Client meeting')).toBe(2);
  });
});

describe('the token gate: 403 and nothing at PayPal', () => {
  const orders = () => t.paypalTransport.calls.filter((c) => c.url.endsWith('/v2/checkout/orders')).length;

  it('refuses a missing, malformed or wrong token', async () => {
    const { proposalId } = await acceptFirst();
    for (const confirmationToken of [undefined, '', 'x', 'A'.repeat(43)]) {
      const r = await t.request('POST', '/api/purchases', { proposalId, confirmationToken });
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('confirmation_token_invalid');
    }
    expect(orders()).toBe(0);
    expect((await t.db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n).toBe(0);
  });

  it('refuses proposal A’s token on proposal B, and another session’s request', async () => {
    const d = await picksFor('Client meeting');
    const [a, b] = d.picks.map((p: { proposalId: string }) => p.proposalId);
    const ta = (await t.request('POST', `/api/proposals/${a}/accept`)).json.data.confirmationToken;
    await t.request('POST', `/api/proposals/${b}/accept`);
    expect((await t.request('POST', '/api/purchases', { proposalId: b, confirmationToken: ta })).status).toBe(403);
    expect((await t.request('POST', '/api/purchases', { proposalId: a, confirmationToken: ta }, {}, 'b')).status).toBe(404);
    expect(orders()).toBe(0);
  });

  it('refuses an expired token (10 minutes) and a reused one', async () => {
    const { proposalId, token } = await acceptFirst();
    t.clock.set(new Date(t.clock.now().getTime() + 10 * 60_000));
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token })).status).toBe(403);
    t.clock.set(new Date('2026-11-16T15:00:00Z'));
    const fresh = (await t.request('POST', `/api/proposals/${proposalId}/accept`)).json.data.confirmationToken;
    expect(fresh).not.toBe(token);
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token })).status).toBe(403); // superseded
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: fresh })).status).toBe(201);
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: fresh })).status).toBe(403); // used
    expect(orders()).toBe(1);
  });

  it('two concurrent submissions: exactly one passes', async () => {
    const { proposalId, token } = await acceptFirst();
    const [r1, r2] = await Promise.all([
      t.request('POST', '/api/purchases', { proposalId, confirmationToken: token }),
      t.request('POST', '/api/purchases', { proposalId, confirmationToken: token }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 403]);
  });

  it('a token that expires unused returns the proposal to proposed', async () => {
    const { proposalId } = await acceptFirst();
    t.clock.set(new Date(t.clock.now().getTime() + 11 * 60_000));
    const d = await picksFor('Client meeting');
    expect(d.picks.find((p: { proposalId: string }) => p.proposalId === proposalId).status).toBe('proposed');
    t.clock.set(new Date('2026-11-16T15:00:00Z'));
  });

  it('a PayPal failure releases the claim, so the shopper may retry', async () => {
    const { proposalId, token } = await acceptFirst();
    t.paypalTransport.failNext('/v2/checkout/orders$');
    const r = await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    expect(r.status).toBe(500);
    expect((await t.db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n).toBe(0);
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token })).status).toBe(201);
  });
});

describe('cancel, failed capture, Not now, expiry', () => {
  it('cancel at PayPal: purchase failed, pick back to proposed, Yes again works', async () => {
    const { proposalId, token } = await acceptFirst();
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    const c = await t.request('POST', `/api/pay/cancel/${proposalId}`);
    expect(c.json.data).toEqual({ outcome: 'failed', proposalId, message: 'Payment did not go through. Nothing was charged.' });
    expect((await t.db.query('SELECT status FROM proposals WHERE id = $1', [proposalId])).rows[0].status).toBe('proposed');
    expect((await t.db.query('SELECT status FROM purchases')).rows).toEqual([{ status: 'failed' }]);
    expect(t.paypalTransport.calls.filter((x) => x.url.endsWith('/capture'))).toHaveLength(0);
    const again = (await t.request('POST', `/api/proposals/${proposalId}/accept`)).json.data.confirmationToken;
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: again })).status).toBe(201);
    const ret = await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(ret.json.data.outcome).toBe('completed');
  });

  it('a capture other than COMPLETED marks the existing purchase failed and keeps the pick', async () => {
    for (const variant of paypalVariants as Fixture[]) {
      await t.db.query('DELETE FROM purchases');
      await t.db.query('DELETE FROM proposals');
      const { proposalId, token } = await acceptFirst();
      await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
      t.paypalTransport.queue(variant);
      const r = await t.request('POST', `/api/pay/return/${proposalId}`);
      expect(r.json.data).toEqual({ outcome: 'failed', proposalId, message: 'Payment did not go through. Nothing was charged.' });
      expect((await t.db.query('SELECT status FROM purchases')).rows).toEqual([{ status: 'failed' }]);
      expect((await t.db.query('SELECT status FROM proposals WHERE id = $1', [proposalId])).rows[0].status).toBe('proposed');
    }
  });

  it('a return that finds the purchase approved retries the capture with the same PayPal-Request-Id', async () => {
    const { proposalId, token } = await acceptFirst();
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    await t.db.query(`UPDATE purchases SET status = 'approved'`);
    const r = await t.request('POST', `/api/pay/return/${proposalId}`);
    expect(r.json.data.outcome).toBe('completed');
    const cap = t.paypalTransport.calls.find((x) => x.url.endsWith('/capture'))!;
    const purchaseId = (await t.db.query('SELECT id FROM purchases')).rows[0].id;
    expect(cap.headers['PayPal-Request-Id']).toBe(`${purchaseId}-capture`);
  });

  it('back from PayPal without finishing, Yes again: the abandoned order fails, the new one proceeds', async () => {
    const { proposalId, token } = await acceptFirst();
    await t.request('POST', '/api/purchases', { proposalId, confirmationToken: token });
    const again = (await t.request('POST', `/api/proposals/${proposalId}/accept`)).json.data.confirmationToken;
    expect((await t.request('POST', '/api/purchases', { proposalId, confirmationToken: again })).status).toBe(201);
    const rows = (await t.db.query('SELECT status FROM purchases ORDER BY created_at')).rows.map((r) => r.status).sort();
    expect(rows).toEqual(['created', 'failed']);
  });

  it('Not now: declined, final, nothing at PayPal; accepted cannot be declined', async () => {
    const d = await picksFor('Client meeting');
    const [a, b] = d.picks.map((p: { proposalId: string }) => p.proposalId);
    const r = await t.request('POST', `/api/proposals/${a}/decline`);
    expect(r.json.data.status).toBe('declined');
    expect((await t.request('POST', `/api/proposals/${a}/decline`)).json.data.status).toBe('declined');
    expect((await t.request('POST', `/api/proposals/${a}/accept`)).status).toBe(400);
    await t.request('POST', `/api/proposals/${b}/accept`);
    expect((await t.request('POST', `/api/proposals/${b}/decline`)).status).toBe(400);
    expect(t.paypalTransport.calls).toHaveLength(0);
    const after = await picksFor('Client meeting');
    expect(after.picks.find((p: { proposalId: string }) => p.proposalId === a).status).toBe('declined');
  });

  it('proposals expire 3 hours after creation; an expired one cannot be accepted', async () => {
    const d = await picksFor('Client meeting');
    const a = d.picks[0].proposalId;
    t.clock.set(new Date(t.clock.now().getTime() + 3 * 3_600_000));
    expect((await t.request('POST', `/api/proposals/${a}/accept`)).status).toBe(400);
    expect((await t.db.query('SELECT status FROM proposals WHERE id = $1', [a])).rows[0].status).toBe('expired');
    const fresh = await picksFor('Client meeting');
    expect(fresh.picks[0].proposalId).not.toBe(a);
    t.clock.set(new Date('2026-11-16T15:00:00Z'));
  });

  it('Thu 5:30 River Rd has one pick; validation errors on bad ids', async () => {
    const d = await picksFor('Dinner');
    expect(d.picks.map((p: { merchantName: string; score: number }) => [p.merchantName, p.score])).toEqual([['Rillito Tacos', 0.95]]);
    expect((await t.request('GET', '/api/appointments/not-a-uuid/picks')).status).toBe(400);
    expect((await t.request('POST', '/api/purchases', {})).status).toBe(400);
    expect((await t.request('POST', '/api/pay/return/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
