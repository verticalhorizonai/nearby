// The app wired to the recorded fixtures and a throwaway database, with a fixed clock.
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildApp, type AppDeps } from '../../src/app.js';
import type { AppConfig } from '../../src/services/config/env.js';
import { McpCalendarSource } from '../../src/services/calendarMcp/client.js';
import { createCalendarMcpServer } from '../../src/services/calendarMcp/server.js';
import { PayPalOrdersAdapter } from '../../src/services/paypal/paypalAdapter.js';
import { fixtureTransport, type Fixture } from '../../src/services/adapters/transport.js';
import paypalFixtures from '../../src/services/adapters/fixtures/paypal.json' with { type: 'json' };
import { createTestDb } from './testDb.js';
import { GooglePlacesAdapter } from '../../src/services/places/placesAdapter.js';
import { AnthropicMessagesAdapter } from '../../src/services/agent/anthropicAdapter.js';
import placesFixtures from '../../src/services/adapters/fixtures/places.json' with { type: 'json' };
import anthropicFixtures from '../../src/services/adapters/fixtures/anthropic.json' with { type: 'json' };

export const ORIGIN = 'http://localhost:3000';
/** Monday 2026-11-16 08:00 Phoenix: the demo week is Tue 17 to Thu 19. */
export const DEFAULT_NOW = new Date('2026-11-16T15:00:00Z');

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: 'unused', appBaseUrl: ORIGIN, appOrigin: ORIGIN, anthropicApiKey: null, anthropicModel: null,
    paypalClientId: 'fixture-client', paypalClientSecret: 'fixture-secret', paypalBaseUrl: 'https://api-m.sandbox.paypal.com',
    googleMapsServerKey: null, googleMapsBrowserKey: null, repoUrl: null, port: 0, ...overrides,
  };
}

export async function createTestApp(opts: { now?: () => Date; deps?: Partial<AppDeps>; googleKeys?: boolean; anthropic?: boolean; config?: Partial<AppConfig> } = {}) {
  const { db, drop } = await createTestDb();
  let current = opts.now ?? (() => DEFAULT_NOW);
  const clock = { set: (d: Date) => (current = () => d), now: () => current() };
  const calendar = new McpCalendarSource(() => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    void createCalendarMcpServer(() => clock.now()).connect(serverT);
    return clientT;
  });
  const paypalTransport = fixtureTransport(paypalFixtures as Fixture[]);
  const paypal = new PayPalOrdersAdapter(paypalTransport, { baseUrl: 'https://api-m.sandbox.paypal.com', clientId: 'fixture-client', clientSecret: 'fixture-secret' });
  const placesTransport = fixtureTransport(placesFixtures as Fixture[]);
  const places = new GooglePlacesAdapter(placesTransport, opts.googleKeys ? 'fixture-places-key' : null);
  const anthropicTransport = fixtureTransport(anthropicFixtures.default as Fixture[]);
  const anthropic = opts.anthropic ? new AnthropicMessagesAdapter(anthropicTransport, { apiKey: 'fixture-key', model: 'fixture-model' }) : null;
  const config = testConfig({ googleMapsBrowserKey: opts.googleKeys ? 'fixture-browser-key' : null, ...opts.config });
  const app = await buildApp({ db, config, calendar, paypal, places, anthropic, isAgentDisabled: () => false, now: () => clock.now(), clientDir: '/nonexistent', ...opts.deps });
  const cookieJar: Record<string, string> = {};
  const request = async (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, headers: Record<string, string> = {}, session = 'a') => {
    const res = await app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: { origin: ORIGIN, ...(cookieJar[session] ? { cookie: `session_id=${cookieJar[session]}` } : {}), ...headers },
    });
    const set = res.cookies.find((c) => c.name === 'session_id');
    if (set) cookieJar[session] = set.value;
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, res };
  };
  /** Queues a scripted Claude transcript, with this appointment's id in it. */
  const scriptAgent = (turns: Fixture[], appointmentId: string) => {
    for (const f of turns) anthropicTransport.queue(JSON.parse(JSON.stringify(f).replaceAll('{{APPOINTMENT_ID}}', appointmentId)));
  };
  return {
    scriptAgent,
    app, db, clock, paypalTransport, placesTransport, anthropicTransport, request, cookieJar,
    close: async () => {
      await app.close();
      await calendar.close();
      await drop();
    },
  };
}
