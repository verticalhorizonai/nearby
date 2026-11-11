// @vitest-environment jsdom
// Home (F6.1; REQ-05-01; task 75) and Choose a seat (F6.2, F6.3; REQ-05-02, REQ-05-03): copy and section order from
// spec 3.11.1, the footer link only with repoUrl, five tiles and eight merchant cards, and Reset demo that asks
// the exact prompt and calls the route only after the visitor confirms.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { ChooseSeatData, PublicConfig } from '@/shared/types';
import { DEMONSTRATION_BANNER_TEXT, RESET_DEMO_CONFIRM_PROMPT } from '@/shared/types';
import { AppRoutes } from '@/client/App';

type Reply = { status: number; body: unknown };
type Handler = (init: RequestInit | undefined) => Reply;

function stubFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const h = routes[`${init?.method ?? 'GET'} ${url.pathname}`];
    const r: Reply = h ? h(init) : { status: 404, body: { success: false, error: { code: 'not_found', message: 'Not found' } } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
  return fn;
}
const ok = (data: unknown): Handler => () => ({ status: 200, body: { success: true, data } });

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
      <Toaster />
    </MemoryRouter>,
  );
}

const MERCHANTS = [
  ['Saguaro Bean Co.', 'Coffee shop', 'near the university', 'Any drink plus pastry', 600],
  ['Fourth Ave Noodle Bar', 'Lunch', 'Fourth Avenue', '15% off lunch for one', 150],
  ['Congress Street Desk', 'Coworking', 'downtown', 'Day pass', 1500],
  ['Barrio Press Juicery', 'Juice bar', 'south of downtown', 'Second smoothie half off', 400],
  ['Catalina Cuts', 'Barber', 'midtown', '$5 off a cut', 2000],
  ['Rillito Tacos', 'Dinner', 'River Road', 'Free horchata with two tacos', 900],
  ['Sonoran Print Shop', 'Printing', 'Speedway', '50 business cards', 1200],
  ['Mesquite Dog Wash', 'Pet care', 'midtown', 'Self-serve wash', 1000],
] as const;

const seats: ChooseSeatData = {
  shopper: {
    appointments: [
      { appointmentId: 'a1', title: 'Client meeting', startsAt: '2026-11-17T16:30:00.000Z' },
      { appointmentId: 'a2', title: 'Lunch with a partner', startsAt: '2026-11-17T19:30:00.000Z' },
      { appointmentId: 'a3', title: 'Workshop', startsAt: '2026-11-18T17:00:00.000Z' },
      { appointmentId: 'a4', title: 'Print pickup', startsAt: '2026-11-18T21:00:00.000Z' },
      { appointmentId: 'a5', title: 'Dinner', startsAt: '2026-11-20T00:30:00.000Z' },
    ],
  },
  merchants: MERCHANTS.map(([name, type, area, offerTitle, offerPriceCents], i) => ({
    merchantId: `00000000-0000-4000-8000-00000000000${i + 1}`,
    name,
    isSample: true,
    type,
    area,
    offerTitle,
    offerPriceCents,
    offerIsDeposit: name === 'Fourth Ave Noodle Bar',
  })),
};

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Home', () => {
  const config = (repoUrl: string | null): PublicConfig => ({ repoUrl, googleMapsBrowserKey: null });

  it('carries the spec copy, in order: hero, two sides, how it works, what is sample, how to test, footer', async () => {
    stubFetch({ 'GET /api/config/public': ok(config(null)) });
    renderAt('/');
    expect(screen.getByText(DEMONSTRATION_BANNER_TEXT)).toBeInTheDocument();
    const headline = screen.getByRole('heading', { level: 1, name: 'The deal that is already on your way.' });
    expect(headline).toHaveClass('text-[38px]', 'sm:text-[60px]', 'font-extrabold', 'leading-[1.02]', 'tracking-[-0.025em]');
    expect(screen.getByText('An AI agent for local offers, paid with PayPal')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nearby reads where your calendar takes you this week, finds one or two offers that fit each stop, and tells you why in a sentence. Say yes once and it pays with PayPal.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No account and no setup. One tap puts you in a seat.')).toBeInTheDocument();
    expect(screen.getByTestId('hero-drawing')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Try the demo' }).every((a) => a.getAttribute('href') === '/seats')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Try the demo' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'How it works' })[0]).toHaveAttribute('href', '#how');
    expect(screen.getByRole('link', { name: 'What is sample' })).toHaveAttribute('href', '#sample');

    const order = [
      'The deal that is already on your way.',
      'A shopper says yes. A shop sees the sale.',
      'Three steps, about two minutes.',
      'What is real and what is sample',
      'How to test',
    ].map((name) => screen.getByRole('heading', { name }));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const step of ['Choose a seat', 'Say yes to a pick', 'Watch the sale arrive']) expect(screen.getByRole('heading', { name: step })).toBeInTheDocument();
    expect(screen.getByText('Payments are PayPal sandbox payments.')).toBeInTheDocument();
    expect(screen.getByTestId('how-to-test')).toHaveClass('bg-banner');
    expect(
      screen.getByText('Pay with the PayPal sandbox buyer account given in the testing notes of the submission. No real card or account is needed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sample data notice: every merchant, offer and appointment in this demo is made up.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Source repository' })).not.toBeInTheDocument());
  });

  it('shows the source repository link only when repoUrl is set', async () => {
    stubFetch({ 'GET /api/config/public': ok(config('https://github.com/example/nearby')) });
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Source repository' })).toHaveAttribute('href', 'https://github.com/example/nearby');
  });
});

describe('Choose a seat', () => {
  it('shows the shopper card with five tiles and eight merchant cards, each with a Sample badge', async () => {
    stubFetch({ 'GET /api/seats': ok(seats) });
    renderAt('/seats');
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a seat' })).toBeInTheDocument();
    expect(screen.getByText('A seat is not a sign-in. It only picks which side of Nearby you see, and you can switch at any time.')).toBeInTheDocument();
    expect(screen.getByText('Tip: open a merchant in a second window to watch a sale arrive.')).toBeInTheDocument();
    const tiles = await screen.findAllByTestId('appointment-tile');
    expect(tiles).toHaveLength(5);
    expect(tiles[0]).toHaveTextContent('Tue 9:30 AM');
    expect(tiles[0]).toHaveTextContent('Client meeting');
    expect(tiles[4]).toHaveTextContent('Thu 5:30 PM');
    expect(screen.getByTestId('shopper-card')).toHaveAttribute('href', '/week');
    expect(screen.getByText('Open the week')).toBeInTheDocument();
    const cards = screen.getAllByTestId('merchant-card');
    expect(cards).toHaveLength(8);
    expect(cards[0]).toHaveTextContent('Saguaro Bean Co.');
    expect(cards[0]).toHaveTextContent('Sample');
    expect(cards[0]).toHaveTextContent('Coffee shop, near the university');
    expect(cards[0]).toHaveTextContent('Any drink plus pastry');
    expect(cards[0]).toHaveTextContent('$6.00');
    expect(cards[0]).toHaveAttribute('href', `/merchant/${seats.merchants[0].merchantId}`);
    expect(cards[0]).toHaveClass('min-h-touch');
  });

  it('Open the week connects the demo calendar on the way and lands in My week, not Connect (AC-REQ-05-03-02)', async () => {
    const fetchMock = stubFetch({
      'GET /api/seats': ok(seats),
      'POST /api/calendar/demo-connection': ok({ calendarName: 'Demo calendar', upcomingAppointmentCount: 5, connectedAt: '2026-11-16T15:00:00.000Z' }),
      'GET /api/calendar/connection': ok({ calendarName: 'Demo calendar', upcomingAppointmentCount: 5, connectedAt: '2026-11-16T15:00:00.000Z' }),
      'GET /api/appointments/upcoming': ok({ appointments: [], skippedEvents: [] }),
      'GET /api/config/public': ok({ repoUrl: null, googleMapsBrowserKey: null }),
    });
    renderAt('/seats');
    fireEvent.click(await screen.findByTestId('shopper-card'));
    expect(await screen.findByRole('heading', { level: 1, name: 'My week' })).toBeInTheDocument();
    const calls = (fetchMock as unknown as { mock: { calls: [RequestInfo, RequestInit?][] } }).mock.calls.map(([u, i]) => `${i?.method ?? 'GET'} ${new URL(String(u), 'http://localhost').pathname}`);
    expect(calls).toContain('POST /api/calendar/demo-connection');
    expect(screen.queryByRole('button', { name: /use the demo calendar/i })).toBeNull();
  });

  it('a merchant card puts the visitor in that merchant seat', async () => {
    stubFetch({ 'GET /api/seats': ok(seats) });
    renderAt('/seats');
    fireEvent.click((await screen.findAllByTestId('merchant-card'))[0]);
    expect(JSON.parse(window.localStorage.getItem('nearby.seat') ?? '{}')).toEqual({
      seat: 'merchant',
      merchantId: seats.merchants[0].merchantId,
      merchantName: 'Saguaro Bean Co.',
      merchantIsSample: true,
    });
  });

  it('Reset demo asks the exact prompt and calls the reset route only after confirming', async () => {
    let resets = 0;
    stubFetch({
      'GET /api/seats': ok(seats),
      'POST /api/demo/reset': () => {
        resets += 1;
        return { status: 200, body: { success: true, data: { proposalsRemoved: 2, purchasesRemoved: 1, appointmentsReenabled: 1 } } };
      },
    });
    renderAt('/seats');
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(await screen.findByRole('alertdialog', { name: RESET_DEMO_CONFIRM_PROMPT })).toBeInTheDocument();
    expect(screen.getByText("Remove this browser's proposals and purchases?")).toBeInTheDocument();
    expect(resets).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(resets).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Reset demo') as HTMLButtonElement);
    await waitFor(() => expect(resets).toBe(1));
    expect(await screen.findByText(/Demo reset\./)).toBeInTheDocument();
  });
});

describe('Merchant list', () => {
  it('shows the same eight merchant cards', async () => {
    stubFetch({ 'GET /api/seats': ok(seats) });
    renderAt('/merchant');
    expect(await screen.findAllByTestId('merchant-card')).toHaveLength(8);
  });
});
