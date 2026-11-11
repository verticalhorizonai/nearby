// Test network guard (spec 3.1; register G-50): no automated test calls a live service. Any fetch to a host other
// than this machine fails the test at once.
import { afterEach } from 'vitest';

const realFetch = globalThis.fetch;
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!LOCAL.has(url.hostname)) {
    throw new Error(`Test network guard: a test tried to reach ${url.hostname}. Use the recorded fixtures.`);
  }
  return realFetch(input, init);
}) as typeof fetch;

afterEach(() => undefined);
