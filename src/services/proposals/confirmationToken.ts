// Confirmation token (task 45; REQ-03-08; spec 3.7.4): minted when the shopper taps Yes; 256 random bits (at least
// 128); only its SHA-256 hash is stored; single use; 10 minutes; bound to that proposal and that session.
import { createHash, randomBytes } from 'node:crypto';
import { CONFIRMATION_TOKEN_MIN_BITS, CONFIRMATION_TOKEN_TTL_MS } from '../../shared/types.js';

export const TOKEN_BYTES = 32;
if (TOKEN_BYTES * 8 < CONFIRMATION_TOKEN_MIN_BITS) throw new Error('confirmation token too short');

export function mintToken(now: Date): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashToken(token), expiresAt: new Date(now.getTime() + CONFIRMATION_TOKEN_TTL_MS) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A syntactically possible token: base64url, 43 characters for 32 bytes. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
