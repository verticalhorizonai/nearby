// Session middleware (task 205; REQ-05-03, REQ-07-05; spec 3.9): every visitor gets a session_id cookie — a random id
// of 256 bits (at least 128), HttpOnly, SameSite=Lax, 30 days. There are no accounts; a seat is not a sign-in.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'session_id';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
  }
}

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_RE.test(value);
}

/** Registers the hook that reads or issues the session cookie on every /api request. */
export function registerSession(app: FastifyInstance, opts: { secure: boolean }): void {
  app.decorateRequest('sessionId', '');
  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const existing = request.cookies[SESSION_COOKIE];
    if (isValidSessionId(existing)) {
      request.sessionId = existing;
      return;
    }
    const id = newSessionId();
    request.sessionId = id;
    reply.setCookie(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secure,
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });
}
