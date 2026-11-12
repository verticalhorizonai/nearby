// Signs of life (build ruling 43): while a stop's agent run is in flight, GET /api/agent/runs gives this session the
// run's real tool calls, in order, as they start; a fallback run records none; another session sees nothing; the run
// is gone once its picks are saved. The model's replies are held at a gate so the run can be looked at mid-flight.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';
import anthropicFixtures from '../../src/services/adapters/fixtures/anthropic.json' with { type: 'json' };
import { fixtureTransport, type Fixture, type Transport } from '../../src/services/adapters/transport.js';
import { AnthropicMessagesAdapter } from '../../src/services/agent/anthropicAdapter.js';

const transcript = anthropicFixtures.transcript_tue_0930 as Fixture[];
const model = fixtureTransport(anthropicFixtures.default as Fixture[]);

/** Holds every model call after the first until the test lets it go. */
let calls = 0;
let release: (() => void) | null = null;
let reached: ((n: number) => void) | null = null;
const gated: Transport = async (req) => {
  calls += 1;
  if (calls > 1) {
    const n = calls;
    await new Promise<void>((r) => {
      release = r;
      reached?.(n);
    });
  }
  return model(req);
};
const atCall = (n: number) =>
  new Promise<void>((resolve) => {
    if (calls >= n && release) return resolve();
    reached = (m) => {
      if (m === n) resolve();
    };
  });
const letGo = () => {
  const r = release;
  release = null;
  r?.();
};

let killSwitch = false;
let t: Awaited<ReturnType<typeof createTestApp>>;
let ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp({
    googleKeys: true,
    deps: { anthropic: new AnthropicMessagesAdapter(gated, { apiKey: 'fixture-key', model: 'fixture-model' }), isAgentDisabled: () => killSwitch },
  });
  await t.request('POST', '/api/calendar/demo-connection');
  const list = await t.request('GET', '/api/appointments/upcoming');
  ids = Object.fromEntries(list.json.data.appointments.map((a: { title: string; id: string }) => [a.title, a.id]));
});
afterAll(async () => t.close());

const runs = async (session = 'a') => (await t.request('GET', '/api/agent/runs', undefined, {}, session)).json.data.runs;
const script = (turns: Fixture[], appointmentId: string) => {
  for (const f of turns) model.queue(JSON.parse(JSON.stringify(f).replaceAll('{{APPOINTMENT_ID}}', appointmentId)));
};

describe('the agent run, live', () => {
  it('records each real tool call as it starts, in order, for this session only, and is gone once the picks are saved', async () => {
    const id = ids['Client meeting'];
    // Turn 1 reads the week, looks up places and asks for the candidates together; turn 2 saves two picks.
    const turn1: Fixture = {
      ...transcript[0],
      body: {
        ...(transcript[0].body as object),
        content: [
          { type: 'tool_use', id: 'toolu_week', name: 'list_upcoming_appointments', input: {} },
          { type: 'tool_use', id: 'toolu_places', name: 'find_places_near', input: { lat: 32.2318, lng: -110.9535 } },
          { type: 'tool_use', id: 'toolu_fixture_1', name: 'find_offer_candidates', input: { appointment_id: '{{APPOINTMENT_ID}}' } },
        ],
      },
    };
    script([turn1, transcript[1], transcript[2]], id);
    calls = 0;
    expect(await runs()).toEqual([]);

    const { match } = await t.app.services.picks.candidatesFor(t.cookieJar.a, id);
    const n = match.candidates.filter((c) => c.score >= 0.35).length;
    const picks = t.request('GET', `/api/appointments/${id}/picks`);

    await atCall(2); // turn 1's tools have run; Claude's second reply is held
    const after1 = await runs();
    expect(after1).toHaveLength(1);
    expect(after1[0]).toMatchObject({ appointmentId: id, mode: 'agent' });
    expect(after1[0].steps.map((s: { tool: string; label: string }) => [s.tool, s.label])).toEqual([
      ['list_upcoming_appointments', 'Reading your week'],
      ['find_places_near', 'Looking up places'],
      ['find_offer_candidates', `Checking ${n} offers`],
    ]);
    expect(await runs('someone-else')).toEqual([]); // another session sees nothing

    letGo();
    await atCall(3); // turn 2's two saves have run
    const after2 = await runs();
    expect(after2[0].steps.map((s: { tool: string }) => s.tool)).toEqual([
      'list_upcoming_appointments', 'find_places_near', 'find_offer_candidates', 'propose_offer', 'propose_offer',
    ]);
    expect(after2[0].steps.at(-1).label).toBe('Choosing');

    letGo();
    const done = await picks;
    expect(done.json.data.picks.map((p: { source: string }) => p.source)).toEqual(['agent', 'agent']);
    expect(await runs()).toEqual([]);
  });

  it('a fallback run records no steps', async () => {
    killSwitch = true;
    const seen: unknown[] = [];
    const activity = t.app.services.activity;
    const begin = activity.begin.bind(activity);
    activity.begin = (s, a) => {
      const r = begin(s, a);
      return { ...r, end: () => { seen.push(activity.list(s).find((x) => x.appointmentId === a)); r.end(); } };
    };
    try {
      const d = await t.request('GET', `/api/appointments/${ids['Workshop']}/picks`);
      expect(d.json.data.picks.map((p: { source: string }) => p.source)).toEqual(['fallback', 'fallback']);
      expect(seen).toEqual([expect.objectContaining({ appointmentId: ids['Workshop'], mode: 'fallback', steps: [] })]);
      expect(await runs()).toEqual([]);
    } finally {
      activity.begin = begin;
      killSwitch = false;
    }
  });

  it('reading the runs never starts a run and never counts toward the rate limit', async () => {
    const before = t.app.services.rateLimiter.counts(t.cookieJar.a).session;
    const modelCalls = calls;
    for (let i = 0; i < 5; i++) await runs();
    expect(t.app.services.rateLimiter.counts(t.cookieJar.a).session).toBe(before);
    expect(calls).toBe(modelCalls);
  });
});
