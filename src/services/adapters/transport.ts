// Every outside service (PayPal, the Anthropic API, Google Places) is reached through one adapter, and every adapter
// speaks HTTP through a Transport (spec 3.1; REQ-07-01; task 83). The live transport is fetch; the fixture transport
// replays recorded responses, and every automated test uses it.
export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** Abort after this many milliseconds. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

/** The live transport: the only place an outside service is called from (outbound boundary, build ruling 8). */
export const fetchTransport: Transport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: req.timeoutMs ? AbortSignal.timeout(req.timeoutMs) : undefined,
  });
  return { status: res.status, body: await res.text() };
};

export interface Fixture {
  /** A name for people; recorded fixtures carry the provider call they replay. */
  name: string;
  method: 'GET' | 'POST';
  /** A regular expression the request URL must match. */
  url: string;
  status: number;
  body: unknown;
}

export interface FixtureTransport extends Transport {
  calls: HttpRequest[];
  /** Answer the next matching request with this fixture instead (used once, first in first out). */
  queue(fixture: Fixture): void;
  /** Make the next matching request fail at the network level. */
  failNext(urlPattern: string, error?: Error): void;
  /** Forget queued fixtures and failures (between tests). */
  clear(): void;
}

/** A transport that answers from recorded fixtures and records every call. Unknown requests fail loudly. */
export function fixtureTransport(fixtures: Fixture[]): FixtureTransport {
  const queued: Fixture[] = [];
  const failures: { url: string; error: Error }[] = [];
  const calls: HttpRequest[] = [];
  let seq = 0;
  const t = (async (req: HttpRequest) => {
    calls.push(req);
    const fi = failures.findIndex((f) => new RegExp(f.url).test(req.url));
    if (fi >= 0) throw failures.splice(fi, 1)[0].error;
    const qi = queued.findIndex((f) => f.method === req.method && new RegExp(f.url).test(req.url));
    const fixture = qi >= 0 ? queued.splice(qi, 1)[0] : fixtures.find((f) => f.method === req.method && new RegExp(f.url).test(req.url));
    if (!fixture) throw new Error(`No recorded fixture for ${req.method} ${req.url}`);
    const text = typeof fixture.body === 'string' ? fixture.body : JSON.stringify(fixture.body);
    // "{{seq}}" makes ids that a live provider would make unique (an order id per order) unique here too.
    const n = String(++seq).padStart(4, '0');
    return { status: fixture.status, body: text.replace(/\{\{seq\}\}/g, n) };
  }) as FixtureTransport;
  t.calls = calls;
  t.queue = (f) => queued.push(f);
  t.failNext = (url, error = new Error('network error (fixture)')) => failures.push({ url, error });
  t.clear = () => {
    queued.length = 0;
    failures.length = 0;
  };
  return t;
}
