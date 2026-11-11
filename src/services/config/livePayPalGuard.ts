// Sandbox only (spec 3.7.3, F7.2 step 1; REQ-06-02, REQ-07-06): the app refuses to start unless the PayPal base URL is
// the sandbox one. Runs before the database pool or the listener is created.
import { PAYPAL_SANDBOX_BASE_URL } from '../../shared/types.js';

export class LivePayPalError extends Error {}

/** Throws LivePayPalError naming PAYPAL_BASE_URL unless it is exactly the sandbox origin (a trailing slash is allowed). */
export function assertPayPalSandbox(baseUrl: string | null | undefined): void {
  const value = (baseUrl ?? '').trim();
  let ok = false;
  try {
    const u = new URL(value);
    ok = u.origin === PAYPAL_SANDBOX_BASE_URL && (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash && !u.username;
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new LivePayPalError(
      `PAYPAL_BASE_URL must be the PayPal sandbox, ${PAYPAL_SANDBOX_BASE_URL}. It is ${value ? `"${value}"` : 'not set'}. ` +
        'Nearby runs in the PayPal sandbox only and will not start otherwise.',
    );
  }
}
