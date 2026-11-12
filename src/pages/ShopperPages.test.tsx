// @vitest-environment jsdom
// Shopper pages through the real routes: the banner's full text on every page (ruling 14; REQ-05-05), the seat chip
// (REQ-05-04), the appointment detail with its SVG map (REQ-02-01), My week (REQ-01-02, REQ-01-03) and Connect (REQ-01-01).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { AppointmentMapData, CalendarConnection, UpcomingAppointmentsResult, UpcomingAppointment } from '@/shared/types';
import { DEMONSTRATION_BANNER_TEXT, NO_MATCH_MESSAGE } from '@/shared/types';
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
}
const ok = (data: unknown): Handler => () => ({ status: 200, body: { success: true, data } });

const appt = (id: string, title: string, startsAt: string, endsAt: string, lat: number, lng: number, enabled = true): UpcomingAppointment => ({
  id,
  title,
  startsAt,
  endsAt,
  address: `${title} address, Tucson`,
  location: { lat, lng },
  enabled,
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
  boughtCount: 0,
});

const A1 = appt('11111111-1111-4111-8111-111111111111', 'Client meeting', '2026-11-17T16:30:00.000Z', '2026-11-17T17:30:00.000Z', 32.2319, -110.9535);
const A2 = appt('22222222-2222-4222-8222-222222222222', 'Lunch with a partner', '2026-11-17T19:30:00.000Z', '2026-11-17T20:30:00.000Z', 32.2268, -110.9617);

const connection: CalendarConnection = { calendarName: 'Demo calendar', upcomingAppointmentCount: 5, connectedAt: '2026-11-11T17:00:00.000Z' };

const mapData: AppointmentMapData = {
  appointment: A1,
  searchRadiusMeters: 1609,
  renderMode: 'svg_plot',
  places: [],
  placesAttributions: [],
  merchants: [
    { merchantId: 'm1', merchantName: 'Saguaro Bean Co.', location: { lat: 32.2335, lng: -110.9515 }, isSample: true, hasOffer: true },
    { merchantId: 'm2', merchantName: 'Desert Wash', location: { lat: 32.228, lng: -110.957 }, isSample: true, hasOffer: false },
  ],
};

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
      <Toaster />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the demonstration banner', () => {
  it.each(['/', '/seats', '/connect', '/week', `/appointments/${A1.id}`, '/merchant', '/merchant/m1', '/nowhere'])(
    'carries the full text on %s',
    (path) => {
      stubFetch({});
      renderAt(path);
      const banner = screen.getByRole('note', { name: 'Demonstration notice' });
      expect(banner).toHaveTextContent(DEMONSTRATION_BANNER_TEXT);
      expect(banner).toHaveClass('bg-banner', 'text-banner-foreground');
    },
  );
});

describe('appointment detail', () => {
  it('shows the header block, the SVG map with its radius chip, and the no-match message', async () => {
    stubFetch({
      [`GET /api/appointments/${A1.id}/map`]: ok(mapData),
      [`GET /api/appointments/${A1.id}/picks`]: ok({ appointmentId: A1.id, picks: [], noMatch: true }),
      'GET /api/config/public': ok({ repoUrl: null, googleMapsBrowserKey: null }),
    });
    renderAt(`/appointments/${A1.id}`);
    expect(await screen.findByRole('heading', { name: 'Client meeting' })).toBeInTheDocument();
    expect(screen.getByText('Tuesday, 9:30 to 10:30 AM')).toBeInTheDocument();
    expect(await screen.findByTestId('svg-plot')).toBeInTheDocument();
    expect(screen.getByText('Your 9:30')).toBeInTheDocument();
    expect(screen.getByText('1 mile')).toBeInTheDocument();
    expect(screen.queryByText('Places from Google')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-pin-kind="offer"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-pin-kind="merchant"]')).toHaveLength(1);
    expect(await screen.findByText(NO_MATCH_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId('seat-chip')).toHaveTextContent('Shopper');
    expect(screen.getByRole('link', { name: 'Back to my week' })).toHaveAttribute('href', '/week');
  });
});

describe('my week', () => {
  const week: UpcomingAppointmentsResult = {
    appointments: [A1, A2],
    skippedEvents: [
      { title: 'Team call', startsAt: '2026-11-17T22:00:00.000Z', reason: 'video_call' },
      { title: 'Pay rent', startsAt: '2026-11-18', reason: 'all_day' },
    ],
  };

  it('lists the appointments by day, folds skipped events with a reason, and draws the map', async () => {
    stubFetch({ 'GET /api/calendar/connection': ok(connection), 'GET /api/appointments/upcoming': ok(week) });
    renderAt('/week');
    expect(await screen.findAllByTestId('appointment-row')).toHaveLength(2);
    expect(screen.getByText('Tuesday, Nov 17')).toBeInTheDocument();
    expect(screen.getByText('9:30 to 10:30 AM')).toBeInTheDocument();
    const rowLink = screen.getAllByRole('link', { name: /Client meeting/ }).find((el) => el.tagName === 'A');
    expect(rowLink).toHaveAttribute('href', `/appointments/${A1.id}`);
    // The map pin for the same stop is a keyboard-reachable link too.
    expect(screen.getAllByRole('link', { name: /Client meeting/ }).some((el) => el.tagName.toLowerCase() === 'g')).toBe(true);
    expect(screen.getByTestId('week-map')).toBeInTheDocument();
    const skipped = screen.getByTestId('skipped-events');
    expect(within(skipped).getByText('Skipped 2 events')).toBeInTheDocument();
    expect(within(skipped).getByText('Video call')).toBeInTheDocument();
    expect(within(skipped).getByText('All day')).toBeInTheDocument();
  });

  it('turns an appointment off at once and puts it back when the save fails (REQ-01-03)', async () => {
    let calls = 0;
    stubFetch({
      'GET /api/calendar/connection': ok(connection),
      'GET /api/appointments/upcoming': ok(week),
      [`PATCH /api/appointments/${A1.id}`]: () => {
        calls += 1;
        return { status: 500, body: { success: false, error: { code: 'internal_error', message: 'Save failed' } } };
      },
    });
    renderAt('/week');
    const toggle = await screen.findByRole('switch', { name: 'Find picks for Client meeting' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveClass('h-11');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(calls).toBe(1);
    expect(await screen.findByText(/Could not save that change/)).toBeInTheDocument();
  });

  it('prefetches the picks of every appointment that is on, and of one turned on later (ruling 32)', async () => {
    const off = { ...A2, enabled: false };
    const noPicks = (id: string) => ok({ appointmentId: id, picks: [], noMatch: true });
    const fn = stubFetch({
      'GET /api/calendar/connection': ok(connection),
      'GET /api/appointments/upcoming': ok({ ...week, appointments: [A1, off] }),
      [`GET /api/appointments/${A1.id}/picks`]: noPicks(A1.id),
      [`GET /api/appointments/${A2.id}/picks`]: noPicks(A2.id),
      [`PATCH /api/appointments/${A2.id}`]: ok({ ...A2, enabled: true }),
    });
    const picksCalls = () =>
      (fn as unknown as { mock: { calls: [RequestInfo, RequestInit?][] } }).mock.calls
        .filter(([u, i]) => (i?.method ?? 'GET') === 'GET' && String(u).endsWith('/picks'))
        .map(([u]) => String(u));
    renderAt('/week');
    await waitFor(() => expect(picksCalls()).toEqual([`/api/appointments/${A1.id}/picks`]));
    fireEvent.click(await screen.findByRole('switch', { name: 'Find picks for Lunch with a partner' }));
    await waitFor(() => expect(picksCalls()).toEqual([`/api/appointments/${A1.id}/picks`, `/api/appointments/${A2.id}/picks`]));
  });

  it('shows "1 bought" or "2 bought" beside a stop\'s title only when picks were bought (build ruling 36)', async () => {
    stubFetch({
      'GET /api/calendar/connection': ok(connection),
      'GET /api/appointments/upcoming': ok({ ...week, appointments: [{ ...A1, boughtCount: 1 }, { ...A2, boughtCount: 0 }] }),
    });
    renderAt('/week');
    const pills = await screen.findAllByTestId('bought-pill');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveTextContent('1 bought');
    expect(pills[0]).toHaveTextContent('1 pick bought for this stop');
    expect(pills[0]).toHaveClass('rounded-full', 'bg-tint', 'text-primary', 'flex-none');
    const rows = screen.getAllByTestId('appointment-row');
    expect(rows[0]).toContainElement(pills[0]);
    expect(rows[1].querySelector('[data-testid="bought-pill"]')).toBeNull();
    // the link that opens the stop is named with it
    expect(screen.getByRole('link', { name: /Client meeting.*1 pick bought for this stop/ })).toBeInTheDocument();
  });

  it('shows "2 bought" with its spoken form', async () => {
    stubFetch({
      'GET /api/calendar/connection': ok(connection),
      'GET /api/appointments/upcoming': ok({ ...week, appointments: [{ ...A1, boughtCount: 2 }] }),
    });
    renderAt('/week');
    const pill = await screen.findByTestId('bought-pill');
    expect(pill).toHaveTextContent('2 bought');
    expect(pill).toHaveTextContent('2 picks bought for this stop');
  });

  it('sends a visitor with no calendar to Connect', async () => {
    stubFetch({});
    renderAt('/week');
    expect(await screen.findByRole('button', { name: 'Use the demo calendar' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no appointments', async () => {
    stubFetch({ 'GET /api/calendar/connection': ok(connection), 'GET /api/appointments/upcoming': ok({ appointments: [], skippedEvents: [] }) });
    renderAt('/week');
    expect(await screen.findByTestId('week-empty')).toBeInTheDocument();
  });
});

describe('connect', () => {
  it('connects the demo calendar and shows its name and count (REQ-01-01)', async () => {
    const fetchFn = stubFetch({ 'POST /api/calendar/demo-connection': ok(connection) });
    renderAt('/connect');
    fireEvent.click(await screen.findByRole('button', { name: 'Use the demo calendar' }));
    expect(await screen.findByRole('heading', { name: 'Demo calendar' })).toBeInTheDocument();
    expect(screen.getByText(/5 upcoming appointments with an address/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my week' })).toHaveAttribute('href', '/week');
    const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[1]).toEqual(expect.objectContaining({ credentials: 'same-origin', body: '{}' }));
  });
});
