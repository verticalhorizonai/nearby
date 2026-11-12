// @vitest-environment jsdom
// Signs of life (build ruling 43), the client side: a My week card shows its run's current step live, then settles to
// what it came to; a fallback run shows "Matched by distance and time" and no steps; polling stops when nothing is in
// flight; the stop page shows the same steps in place of "The agent is choosing…"; the dot does not pulse under
// reduced motion; announcements are polite and said once.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AgentRun, AppointmentPicks, Pick, UpcomingAppointmentsResult } from '@/shared/types';
import { AppRoutes } from '@/client/App';
import { PicksPanel, AGENT_CHOOSING_LINE } from './PicksPanel';

const ID = '11111111-1111-4111-8111-111111111111';
const week: UpcomingAppointmentsResult = {
  appointments: [{
    id: ID, title: 'Client meeting', startsAt: '2026-11-17T16:30:00.000Z', endsAt: '2026-11-17T17:30:00.000Z', address: 'Old Main, Tucson',
    location: { lat: 32.2318, lng: -110.9535 }, enabled: true, addedBy: 'calendar', createdAt: '2026-11-16T15:00:00.000Z', updatedAt: '2026-11-16T15:00:00.000Z', boughtCount: 1,
  }],
  skippedEvents: [],
};
const pick = (n: number): Pick => ({
  proposalId: `p-${n}`, merchantId: 'm1', merchantName: `Merchant ${n}`, merchantIsSample: true, offerId: `o-${n}`, offerTitle: 'Offer',
  priceCents: 600, regularPriceCents: null, validWindow: { validDays: ['tue'], validStartTime: '07:00', validEndTime: '11:00' },
  reason: 'Merchant is 0.2 mi from your 9:30 and the deal runs until 11.', distanceMeters: 320, score: 0.9, source: 'agent', status: 'proposed', purchased: false,
});
const step = (tool: string, label: string) => ({ tool, label, startedAt: '2026-11-16T15:00:01.000Z' });
const run = (steps: AgentRun['steps'], mode: AgentRun['mode'] = 'agent'): AgentRun => ({ appointmentId: ID, mode, startedAt: '2026-11-16T15:00:00.000Z', steps });

/** A fetch stub whose picks answer the test releases, and whose runs answer the test sets. */
function server() {
  let runsNow: AgentRun[] = [];
  let resolvePicks: (p: AppointmentPicks) => void = () => undefined;
  const picksAnswer = new Promise<AppointmentPicks>((r) => (resolvePicks = r));
  let runsCalls = 0;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: { code: 'not_found', message: 'x' } }), { status });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/appointments/upcoming') return reply(week);
    if (path === '/api/calendar/connection') return reply({ calendarName: 'Demo calendar', upcomingAppointmentCount: 1, connectedAt: '2026-11-16T15:00:00.000Z' });
    if (path === '/api/agent/runs') {
      runsCalls += 1;
      return reply({ runs: runsNow });
    }
    if (path === `/api/appointments/${ID}/picks`) return reply(await picksAnswer);
    return reply(null, 404);
  }));
  return {
    setRuns: (r: AgentRun[]) => (runsNow = r),
    finish: (p: AppointmentPicks) => resolvePicks(p),
    runsCalls: () => runsCalls,
  };
}

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  );

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a My week card while its run is in flight', () => {
  it('shows the current step live beside the bought pill, then settles to the count, announced once; polling stops', async () => {
    const s = server();
    s.setRuns([run([step('list_upcoming_appointments', 'Reading your week')])]);
    at('/week');
    const row = await screen.findByTestId('appointment-row');
    const live = await within(row).findByTestId('run-live');
    expect(live).toHaveTextContent('Reading your week');
    expect(within(live).getByTestId('activity-dot')).toHaveClass('animate-pulse', 'motion-reduce:animate-none');
    // In place of the address line, in its 14 px text, truncated if long: the card keeps its height (checked at 375 px
    // in a browser). The address is back once the run settles.
    expect(within(row).queryByText('Old Main, Tucson')).toBeNull();
    expect(live).toHaveClass('text-sm');
    expect(live.querySelector('.truncate')).not.toBeNull();
    expect(within(row).queryByTestId('run-chip')).toBeNull();

    s.setRuns([run([step('list_upcoming_appointments', 'Reading your week'), step('find_offer_candidates', 'Checking 3 offers')])]);
    await waitFor(() => expect(within(row).getByTestId('run-live')).toHaveTextContent('Checking 3 offers'), { timeout: 3000 });

    s.setRuns([]);
    s.finish({ appointmentId: ID, picks: [pick(1), pick(2)], noMatch: false });
    const chip = await within(row).findByTestId('run-chip', {}, { timeout: 3000 });
    expect(chip).toHaveTextContent('2 picks');
    // Beside the bought pill, on the title's line.
    expect(chip.parentElement).toBe(within(row).getByTestId('bought-pill').parentElement);
    expect(within(row).queryByTestId('run-live')).toBeNull();
    expect(within(row).queryByTestId('activity-dot')).toBeNull();
    expect(within(row).getByText('Old Main, Tucson')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('week-announce')).toHaveTextContent('Client meeting: 2 picks.'));
    expect(screen.getByTestId('week-announce')).toHaveAttribute('aria-live', 'polite');

    // Nothing in flight: no more asking.
    await waitFor(() => expect(s.runsCalls()).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 900));
    const calls = s.runsCalls();
    await new Promise((r) => setTimeout(r, 1600));
    expect(s.runsCalls()).toBe(calls);
    expect(screen.getByTestId('week-announce')).toHaveTextContent(/^Client meeting: 2 picks\.$/);
  }, 10_000);

  it('a fallback run shows "Matched by distance and time" and no steps, then settles; "Nothing fits" for no match', async () => {
    const s = server();
    s.setRuns([run([], 'fallback')]);
    at('/week');
    const live = await screen.findByTestId('run-live');
    expect(live).toHaveTextContent('Matched by distance and time');
    expect(screen.queryByTestId('activity-dot')).toBeNull();
    s.setRuns([]);
    s.finish({ appointmentId: ID, picks: [], noMatch: true });
    await waitFor(() => expect(screen.getByTestId('run-chip')).toHaveTextContent('Nothing fits'), { timeout: 3000 });
  });
});

describe('the stop page while its run is in flight', () => {
  it('shows the steps in order in place of "The agent is choosing…", the current one announced, then the cards', async () => {
    const s = server();
    s.setRuns([run([step('find_offer_candidates', 'Checking 3 offers'), step('propose_offer', 'Choosing'), step('propose_offer', 'Choosing')])]);
    render(<PicksPanel appointmentId={ID} />);
    const steps = await screen.findAllByTestId('run-step');
    expect(steps.map((e) => e.textContent)).toEqual(['Checking 3 offers', 'Choosing']);
    expect(steps[1]).toHaveAttribute('data-current', 'true');
    expect(screen.queryByText(AGENT_CHOOSING_LINE)).toBeNull();
    expect(screen.getByTestId('run-announce')).toHaveTextContent('Choosing');
    expect(screen.getByTestId('run-announce')).toHaveAttribute('aria-live', 'polite');
    s.setRuns([]);
    s.finish({ appointmentId: ID, picks: [pick(1)], noMatch: false });
    expect(await screen.findAllByTestId('pick-card')).toHaveLength(1);
    expect(screen.queryByTestId('run-steps')).toBeNull();
  });

  it('keeps "The agent is choosing…" until the first step, and shows the fallback line for a fallback run', async () => {
    const s = server();
    s.setRuns([run([])]);
    render(<PicksPanel appointmentId={ID} />);
    expect(await screen.findByTestId('picks-loading-line')).toHaveTextContent(AGENT_CHOOSING_LINE);
    s.setRuns([run([], 'fallback')]);
    expect(await screen.findByTestId('run-fallback-line', {}, { timeout: 3000 })).toHaveTextContent('Matched by distance and time');
    s.finish({ appointmentId: ID, picks: [], noMatch: true });
    expect(await screen.findByTestId('no-match')).toBeInTheDocument();
  });
});
