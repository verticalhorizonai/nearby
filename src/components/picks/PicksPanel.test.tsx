// @vitest-environment jsdom
// Picks for one appointment (REQ-02-02, REQ-02-03, REQ-03-01, REQ-03-02, REQ-03-08): headings, the no-match message,
// hidden declined picks, Not now, Yes -> confirm sheet -> Pay with PayPal, and a refused payment.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Toaster } from 'sonner';
import type { AcceptProposalResult, AppointmentPicks, Pick } from '@/shared/types';
import { NO_MATCH_MESSAGE, PAYMENT_FAILED_MESSAGE } from '@/shared/types';
import { PicksPanel } from './PicksPanel';

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };

function stubFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ success: false, error: { code: 'not_found', message: key } }), { status: 404 });
    const { status, body } = h(init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const ok = (data: unknown) => () => ({ status: 200, body: { success: true, data } });

const APPT = '3f6b1c2e-8a4d-4f7e-9b1a-2c5d6e7f8a90';
const base: Omit<Pick, 'proposalId' | 'merchantName' | 'offerTitle'> = {
  merchantId: 'm1',
  merchantIsSample: true,
  offerId: 'o1',
  priceCents: 600,
  regularPriceCents: null,
  validWindow: { validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '07:00', validEndTime: '11:00' },
  reason: 'Saguaro Bean is two blocks from your 9:30 and the deal runs until 11.',
  distanceMeters: 322,
  score: 0.9,
  source: 'agent',
  status: 'proposed',
  purchased: false,
};
const p1: Pick = { ...base, proposalId: 'p-1', merchantName: 'Saguaro Bean Co.', offerTitle: 'Any drink plus pastry' };
const p2: Pick = { ...base, proposalId: 'p-2', merchantName: 'Sonoran Print Shop', offerTitle: '50 business cards', priceCents: 1200 };

function picks(list: Pick[], noMatch = false): AppointmentPicks {
  return { appointmentId: APPT, picks: list, noMatch };
}

const accept: AcceptProposalResult = {
  confirmSheet: {
    proposalId: 'p-1',
    merchantName: 'Saguaro Bean Co.',
    merchantIsSample: true,
    offerTitle: 'Any drink plus pastry',
    priceCents: 600,
    validWindow: base.validWindow,
  },
  confirmationToken: 'tok-123',
  confirmationTokenExpiresAt: '2026-11-17T16:40:00.000Z',
};

function renderPanel(redirect = vi.fn()) {
  render(
    <>
      <PicksPanel appointmentId={APPT} redirect={redirect} />
      <Toaster />
    </>,
  );
  return redirect;
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('hidden picks shown again (build ruling 40)', () => {
  const declined = (p: Pick): Pick => ({ ...p, status: 'declined' });
  const restoreRoute = `POST /api/appointments/${APPT}/picks/restore`;

  it('no control when nothing is hidden', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1, p2])) });
    renderPanel();
    await screen.findAllByTestId('pick-card');
    expect(screen.queryByTestId('show-hidden-picks')).toBeNull();
  });

  it('one hidden: "Show 1 hidden pick" under the cards; the tap brings it back in its order, with Yes and Not now, and is announced', async () => {
    let restoreCalls = 0;
    stubFetch({
      [`GET /api/appointments/${APPT}/picks`]: ok(picks([declined(p1), p2])),
      [restoreRoute]: () => { restoreCalls++; return { status: 200, body: { success: true, data: { ...picks([p1, p2]), restored: 1 } } }; },
    });
    renderPanel();
    expect(await screen.findAllByTestId('pick-card')).toHaveLength(1);
    const control = screen.getByTestId('show-hidden-picks');
    expect(control).toHaveTextContent('Show 1 hidden pick');
    expect(control.className).toMatch(/min-h-touch|h-1[12]/);
    expect(control.className).toMatch(/focus-visible:ring-2/);
    fireEvent.click(control);
    await waitFor(() => expect(screen.getAllByTestId('pick-card')).toHaveLength(2));
    expect(restoreCalls).toBe(1);
    const cards = screen.getAllByTestId('pick-card');
    expect(cards[0]).toHaveTextContent('Saguaro Bean Co.');
    expect(cards[1]).toHaveTextContent('Sonoran Print Shop');
    expect(screen.getAllByRole('button', { name: /^Not now/ })).toHaveLength(2);
    expect(screen.getByTestId('picks-announce')).toHaveTextContent('1 pick is shown again.');
    expect(screen.queryByTestId('show-hidden-picks')).toBeNull();
  });

  it('all passed on: its own line (not the no-match message) and "Show 2 hidden picks"', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([declined(p1), declined(p2)])) });
    renderPanel();
    expect(await screen.findByTestId('picks-all-passed')).toHaveTextContent('You passed on the picks for this stop.');
    expect(screen.queryByText('Nothing nearby fits this one')).toBeNull();
    expect(screen.getByTestId('show-hidden-picks')).toHaveTextContent('Show 2 hidden picks');
  });

  it('the no-match message stays for a stop where the agent found nothing, with no control', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([], true)) });
    renderPanel();
    expect(await screen.findByText('Nothing nearby fits this one')).toBeInTheDocument();
    expect(screen.queryByTestId('show-hidden-picks')).toBeNull();
  });
});

describe('PicksPanel label above the cards (ruling 25)', () => {
  it('reads "Chosen by the agent" when the agent chose the picks', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1, p2])) });
    renderPanel();
    expect(await screen.findByTestId('picks-source-label')).toHaveTextContent('Chosen by the agent');
    expect(screen.queryByText('Matched by distance and time')).toBeNull();
  });
  it('reads "Matched by distance and time" when the fallback chose them', async () => {
    const fb = (p: Pick): Pick => ({ ...p, source: 'fallback' });
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([fb(p1), fb(p2)])) });
    renderPanel();
    expect(await screen.findByTestId('picks-source-label')).toHaveTextContent('Matched by distance and time');
    expect(screen.queryByText('Chosen by the agent')).toBeNull();
  });
});

describe('PicksPanel', () => {
  it('shows skeletons while the picks load, then two cards under "Two picks for this stop"', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1, p2])) });
    renderPanel();
    expect(screen.getAllByTestId('pick-skeleton')).toHaveLength(2);
    expect(screen.getByTestId('picks-loading-line')).toHaveTextContent('The agent is choosing\u2026');
    expect(await screen.findByText('Two picks for this stop')).toBeInTheDocument();
    expect(screen.queryByTestId('picks-loading-line')).toBeNull();
    expect(screen.getByText('Chosen by the agent')).toBeInTheDocument();
    expect(screen.getAllByTestId('pick-card')).toHaveLength(2);
    expect(screen.getByText('Nothing is bought until you tap Yes and approve it on PayPal.')).toBeInTheDocument();
  });

  it('shows the no-match message (REQ-02-03)', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([], true)) });
    renderPanel();
    expect(await screen.findByTestId('no-match')).toHaveTextContent(NO_MATCH_MESSAGE);
    expect(screen.getByText('Nothing nearby fits this one')).toBeInTheDocument();
    expect(screen.queryByTestId('pick-card')).not.toBeInTheDocument();
  });

  it('hides a declined pick and reads "One pick for this stop"', async () => {
    stubFetch({ [`GET /api/appointments/${APPT}/picks`]: ok(picks([{ ...p1, status: 'declined' }, p2])) });
    renderPanel();
    expect(await screen.findByText('One pick for this stop')).toBeInTheDocument();
    expect(screen.getAllByTestId('pick-card')).toHaveLength(1);
    expect(screen.queryByText('Saguaro Bean Co.')).not.toBeInTheDocument();
  });

  it('Not now declines the pick and removes it (REQ-03-02)', async () => {
    const fetchFn = stubFetch({
      [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1, p2])),
      'POST /api/proposals/p-1/decline': ok({ id: 'p-1', status: 'declined' }),
    });
    renderPanel();
    await screen.findByText('Two picks for this stop');
    fireEvent.click(screen.getByRole('button', { name: 'Not now, Any drink plus pastry from Saguaro Bean Co.' }));
    await waitFor(() => expect(screen.getAllByTestId('pick-card')).toHaveLength(1));
    expect(screen.getByText('One pick for this stop')).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith('/api/proposals/p-1/decline', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
  });

  it('Yes opens the confirm sheet; Pay sends the token, never an amount, and leaves for PayPal (REQ-03-01, REQ-03-08)', async () => {
    let payBody: unknown;
    stubFetch({
      [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1])),
      'POST /api/proposals/p-1/accept': ok(accept),
      'POST /api/purchases': (init) => {
        payBody = JSON.parse(String(init?.body));
        return { status: 201, body: { success: true, data: { purchaseId: 'u-1', payerActionUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=T1' } } };
      },
    });
    const redirect = renderPanel();
    await screen.findByText('One pick for this stop');
    fireEvent.click(screen.getByRole('button', { name: /^Yes/ }));
    const pay = await screen.findByRole('button', { name: 'Pay with PayPal' });
    expect(pay).toHaveClass('h-12');
    expect(screen.getByText('Sample merchant')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-price')).toHaveTextContent('$6.00');
    fireEvent.click(pay);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('https://www.sandbox.paypal.com/checkoutnow?token=T1'));
    expect(payBody).toEqual({ proposalId: 'p-1', confirmationToken: 'tok-123' });
    expect(window.sessionStorage.getItem('nearby.pending.p-1')).toBe(APPT);
  });

  it('a refused payment shows the failure toast and keeps the pick', async () => {
    stubFetch({
      [`GET /api/appointments/${APPT}/picks`]: ok(picks([p1])),
      'POST /api/proposals/p-1/accept': ok(accept),
      'POST /api/purchases': () => ({
        status: 403,
        body: { success: false, error: { code: 'confirmation_token_invalid', message: 'Token invalid' } },
      }),
    });
    const redirect = renderPanel();
    await screen.findByText('One pick for this stop');
    fireEvent.click(screen.getByRole('button', { name: /^Yes/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pay with PayPal' }));
    expect(await screen.findByText(PAYMENT_FAILED_MESSAGE)).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pick-card')).toHaveLength(1);
  });
});
