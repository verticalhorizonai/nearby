// Server start (spec 3.1, 3.7.3, 3.13): configuration, the sandbox guard, the schema, then listen.
import { loadConfig } from './services/config/env.js';
import { assertPayPalSandbox } from './services/config/livePayPalGuard.js';
import { createPool } from './models/db.js';
import { applySchema } from './models/schema/runner.js';
import { buildApp } from './app.js';
import { McpCalendarSource } from './services/calendarMcp/client.js';
import { PayPalOrdersAdapter } from './services/paypal/paypalAdapter.js';
import { fetchTransport } from './services/adapters/transport.js';
import { GooglePlacesAdapter } from './services/places/placesAdapter.js';
import { AnthropicMessagesAdapter } from './services/agent/anthropicAdapter.js';
import { boundedTransport } from './guards/outboundBoundary.js';
import { assertClientHasNoSecrets } from './guards/credentialLeakScan.js';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const config = loadConfig();
  assertPayPalSandbox(config.paypalBaseUrl); // before the pool or the listener (REQ-06-02)
  await assertClientHasNoSecrets(fileURLToPath(new URL('../client/', import.meta.url)));
  const outbound = boundedTransport(fetchTransport);
  const db = createPool(config.databaseUrl);
  await applySchema(db);
  const calendar = new McpCalendarSource();
  const paypal = new PayPalOrdersAdapter(outbound, {
    baseUrl: config.paypalBaseUrl.replace(/\/+$/, ''),
    clientId: config.paypalClientId,
    clientSecret: config.paypalClientSecret,
  });
  const places = new GooglePlacesAdapter(outbound, config.googleMapsServerKey);
  const anthropic =
    config.anthropicApiKey && config.anthropicModel
      ? new AnthropicMessagesAdapter(outbound, { apiKey: config.anthropicApiKey, model: config.anthropicModel })
      : null;
  const app = await buildApp({ db, config, calendar, paypal, places, anthropic, logger: true });
  const close = async () => {
    await app.close();
    await calendar.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(`Nearby did not start: ${(err as Error).message}`);
  process.exit(1);
});
