// Guardrails (REQ-06-02, REQ-07-01, REQ-07-03, REQ-07-04, REQ-07-05; spec 3.1, 3.7.3, 3.9, 3.13).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertPayPalSandbox } from '../../src/services/config/livePayPalGuard.js';
import { isAgentDisabled, loadConfig } from '../../src/services/config/env.js';
import { boundedTransport, isAllowedOutbound } from '../../src/guards/outboundBoundary.js';
import { findLeaks } from '../../src/guards/credentialLeakScan.js';
import { originAllowed } from '../../src/middleware/originGuard.js';
import { createTestApp, ORIGIN } from '../helpers/testApp.js';

const ROOT = join(import.meta.dirname, '..', '..');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const prodFiles = sourceFiles(join(ROOT, 'src')).filter((f) => !/\.test\.tsx?$/.test(f));

describe('sandbox only (3.7.3)', () => {
  it('starts only with the sandbox URL', () => {
    expect(() => assertPayPalSandbox('https://api-m.sandbox.paypal.com')).not.toThrow();
    expect(() => assertPayPalSandbox('https://api-m.sandbox.paypal.com/')).not.toThrow();
    for (const bad of [undefined, '', 'https://api-m.paypal.com', 'http://api-m.sandbox.paypal.com', 'https://api-m.sandbox.paypal.com.evil.example', 'https://evil.example/https://api-m.sandbox.paypal.com']) {
      expect(() => assertPayPalSandbox(bad)).toThrow(/PAYPAL_BASE_URL/);
    }
  });
  it('the server process exits before listening with a live URL', () => {
    let out = '';
    try {
      execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'src/server.ts')], {
        env: { ...process.env, DATABASE_URL: 'postgres://nobody@127.0.0.1:1/x', APP_BASE_URL: ORIGIN, PAYPAL_BASE_URL: 'https://api-m.paypal.com' },
        stdio: 'pipe', timeout: 20000,
      });
    } catch (e) {
      out = String((e as { stderr: Buffer }).stderr);
      expect((e as { status: number }).status).toBe(1);
    }
    expect(out).toContain('PAYPAL_BASE_URL must be the PayPal sandbox');
  });
  it('the kill switch reads "true" only', () => {
    expect(isAgentDisabled({ AGENT_DISABLED: 'true' })).toBe(true);
    expect(isAgentDisabled({ AGENT_DISABLED: ' TRUE ' })).toBe(true);
    for (const v of [undefined, '', 'false', '1', 'yes', 'on']) expect(isAgentDisabled({ AGENT_DISABLED: v })).toBe(false);
  });
  it('a missing required variable is named', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'x' })).toThrow(/APP_BASE_URL/);
  });
});

describe('every outside service through one adapter (3.1)', () => {
  it('the outbound boundary allows only the three services over HTTPS', async () => {
    expect(isAllowedOutbound('https://api-m.sandbox.paypal.com/v2/checkout/orders')).toBe(true);
    expect(isAllowedOutbound('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isAllowedOutbound('https://places.googleapis.com/v1/places:searchNearby')).toBe(true);
    expect(isAllowedOutbound('https://api-m.paypal.com/v2/checkout/orders')).toBe(false);
    expect(isAllowedOutbound('http://api.anthropic.com/v1/messages')).toBe(false);
    const t = boundedTransport(async () => ({ status: 200, body: '' }));
    await expect(t({ method: 'GET', url: 'https://evil.example/', headers: {} })).rejects.toThrow(/not an allowed service/);
  });
  it('only the transport calls fetch, and only the three adapters name the services', () => {
    const callers = prodFiles.filter((f) => /\bfetch\(/.test(readFileSync(f, 'utf8')) && !f.includes('/src/components/') && !f.includes('/src/hooks/') && !f.includes('/src/pages/'));
    expect(callers.map((f) => f.slice(ROOT.length))).toEqual(['/src/services/adapters/transport.ts']);
    const hosts = { 'paypal.com': 'src/services/paypal/paypalAdapter.ts', 'anthropic.com': 'src/services/agent/anthropicAdapter.ts', 'places.googleapis.com': 'src/services/places/placesAdapter.ts' };
    for (const [host, owner] of Object.entries(hosts)) {
      const named = prodFiles.filter((f) => readFileSync(f, 'utf8').includes(host)).map((f) => f.slice(ROOT.length + 1));
      for (const f of named) expect([owner, 'src/guards/outboundBoundary.ts', 'src/shared/types.ts', 'src/components/map/googleMaps.ts', 'src/services/adapters/recordFixtures.ts']).toContain(f);
    }
  });
  it('the recorded fixtures exist for all three adapters', () => {
    for (const f of ['paypal.json', 'places.json', 'anthropic.json']) {
      expect(statSync(join(ROOT, 'src/services/adapters/fixtures', f)).size).toBeGreaterThan(100);
    }
  });
});

describe('credentials and file scope (3.13)', () => {
  it('finds a secret value or a key pattern', () => {
    expect(findLeaks('const k = "abcdefgh12345"', { PAYPAL_CLIENT_SECRET: 'abcdefgh12345' })).toEqual(['PAYPAL_CLIENT_SECRET']);
    expect(findLeaks('sk-ant-api03-' + 'x'.repeat(30), {})).toHaveLength(1);
    expect(findLeaks('nothing here', { PAYPAL_CLIENT_SECRET: 'abcdefgh12345' })).toEqual([]);
  });
  it('no committed source, test or fixture holds a credential', () => {
    const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'test'))];
    const fixtureDir = join(ROOT, 'src/services/adapters/fixtures');
    for (const f of [...files, ...readdirSync(fixtureDir).map((n) => join(fixtureDir, n)), join(ROOT, '.env.example')]) {
      expect(findLeaks(readFileSync(f, 'utf8'), {}), f).toEqual([]);
    }
  });
  it('.env.example lists all eleven variables with placeholders', () => {
    const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const v of ['DATABASE_URL', 'APP_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'AGENT_DISABLED', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_BASE_URL', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_BROWSER_KEY', 'APP_REPO_URL']) {
      expect(text).toMatch(new RegExp(`^${v}=`, 'm'));
    }
  });
  it('nothing in the application or its tests reads specs/, tasks/, agents/, tools/, design/ or verification-reports/', () => {
    const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'test'))].filter((f) => !f.endsWith('guards.test.ts'));
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/(readFile|readFileSync|import|from|require|join|resolve)\s*\(?[^\n]*['"`][^'"`\n]*\b(specs|tasks|agents|tools|verification-reports|design)\//);
    }
  });
});

describe('the session cookie and the origin rule (3.9)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { t = await createTestApp(); });
  afterAll(async () => { await t.close(); });
  it('a random 256-bit id, HttpOnly, SameSite=Lax, 30 days', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/config/public' });
    const c = r.cookies.find((x) => x.name === 'session_id')!;
    expect(c.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
    expect(c.maxAge).toBe(30 * 24 * 3600);
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add((await t.app.inject({ method: 'GET', url: '/api/config/public' })).cookies[0].value);
    expect(ids.size).toBe(20);
  });
  it('a malformed cookie gets a new session', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/config/public', headers: { cookie: 'session_id=short' } });
    expect(r.cookies[0].value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('writes only from the app’s own origin; the picks GET refuses a cross-site request', () => {
    const req = (method: string, url: string, headers: Record<string, string>) => ({ method, url, headers });
    expect(originAllowed(req('POST', '/api/purchases', { origin: ORIGIN }), ORIGIN)).toBe(true);
    expect(originAllowed(req('POST', '/api/purchases', {}), ORIGIN)).toBe(false);
    expect(originAllowed(req('POST', '/api/purchases', { origin: 'null' }), ORIGIN)).toBe(false);
    expect(originAllowed(req('PATCH', '/api/appointments/x', { origin: 'https://evil.example' }), ORIGIN)).toBe(false);
    expect(originAllowed(req('GET', '/api/appointments/x/picks', {}), ORIGIN)).toBe(true);
    expect(originAllowed(req('GET', '/api/appointments/x/picks', { 'sec-fetch-site': 'cross-site' }), ORIGIN)).toBe(false);
    expect(originAllowed(req('GET', '/api/appointments/x/picks', { origin: 'https://evil.example' }), ORIGIN)).toBe(false);
    expect(originAllowed(req('GET', '/api/seats', { origin: 'https://evil.example' }), ORIGIN)).toBe(true);
  });
});
