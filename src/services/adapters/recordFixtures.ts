// The fixture recorder (task 83; G-50): a developer command, never part of npm test. It calls the live sandbox
// services with the developer's own keys (from the environment) and writes what they answer next to the fixtures, so
// the hand-written fixture shapes can be replaced by recorded ones. Run: npm run record:fixtures -- <places|paypal|anthropic>
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchTransport, type HttpRequest, type Transport } from './transport.js';
import { boundedTransport } from '../../guards/outboundBoundary.js';
import { assertPayPalSandbox } from '../config/livePayPalGuard.js';
import { GooglePlacesAdapter, includedTypesFor } from '../places/placesAdapter.js';
import { PayPalOrdersAdapter } from '../paypal/paypalAdapter.js';
import { AnthropicMessagesAdapter } from '../agent/anthropicAdapter.js';

const recorded: { name: string; method: string; url: string; status: number; body: unknown }[] = [];
const recording: Transport = async (req: HttpRequest) => {
  const res = await boundedTransport(fetchTransport)(req);
  let body: unknown = res.body;
  try { body = JSON.parse(res.body); } catch { /* keep text */ }
  recorded.push({ name: `recorded ${new Date().toISOString()}`, method: req.method, url: `^${new URL(req.url).origin.replace(/\./g, '\\.')}${new URL(req.url).pathname}$`, status: res.status, body });
  return res;
};

const which = process.argv[2];
const env = process.env;
if (which === 'places') {
  await new GooglePlacesAdapter(recording, env.GOOGLE_MAPS_SERVER_KEY ?? null).searchNearby({ lat: 32.2318, lng: -110.9535, radiusMeters: 1609, includedTypes: includedTypesFor(570) });
} else if (which === 'paypal') {
  assertPayPalSandbox(env.PAYPAL_BASE_URL);
  await new PayPalOrdersAdapter(recording, { baseUrl: 'https://api-m.sandbox.paypal.com', clientId: env.PAYPAL_CLIENT_ID ?? null, clientSecret: env.PAYPAL_CLIENT_SECRET ?? null })
    .createOrder({ requestId: crypto.randomUUID(), proposalId: 'recording', description: 'Saguaro Bean Co. [Sample]: Any drink plus pastry', amountValue: '6.00', returnUrl: 'https://example.com/pay/return', cancelUrl: 'https://example.com/pay/cancel' });
} else if (which === 'anthropic') {
  await new AnthropicMessagesAdapter(recording, { apiKey: env.ANTHROPIC_API_KEY ?? '', model: env.ANTHROPIC_MODEL ?? '' })
    .createMessage({ system: 'Reply with the JSON array [] and nothing else.', messages: [{ role: 'user', content: 'Nothing fits.' }], tools: [], max_tokens: 50 }, 20000);
} else {
  console.error('usage: npm run record:fixtures -- <places|paypal|anthropic>');
  process.exit(2);
}
const out = fileURLToPath(new URL(`./fixtures/recorded-${which}.json`, import.meta.url));
// Tokens and keys never reach a fixture: the recorder keeps response bodies only, and drops access tokens.
writeFileSync(out, JSON.stringify(recorded, (k, v) => (k === 'access_token' ? 'REDACTED' : v), 2) + '\n');
console.log(`Recorded ${recorded.length} response(s) to ${out}`);
