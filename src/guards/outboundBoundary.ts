// The outbound boundary (task 87 by build ruling 8; REQ-07-01, REQ-07-03; spec 3.1): the running app reaches exactly
// three outside services, each through its one adapter — the PayPal sandbox, the Anthropic API and Google Places. The
// live transport is wrapped so any other host is refused before a byte leaves the server.
import type { Transport } from '../services/adapters/transport.js';

export const ALLOWED_OUTBOUND_HOSTS: readonly string[] = ['api-m.sandbox.paypal.com', 'api.anthropic.com', 'places.googleapis.com'];

export class OutboundBoundaryError extends Error {}

export function isAllowedOutbound(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_OUTBOUND_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Wraps a transport so it only ever reaches the three allowed hosts over HTTPS. */
export function boundedTransport(inner: Transport): Transport {
  return async (req) => {
    if (!isAllowedOutbound(req.url)) throw new OutboundBoundaryError(`Outbound call refused: ${new URL(req.url).hostname} is not an allowed service`);
    return inner(req);
  };
}
