// Origin rule (spec 3.9: "A request that changes anything is accepted only from the app's own origin"; REQ-07-05;
// build ruling 15(c)). Runs before any handler. A refusal is 403 forbidden_origin.
import type { FastifyInstance, FastifyRequest } from 'fastify';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** The one GET that persists state: picks save proposals (api-contracts.md, picks route). */
const STATE_CHANGING_GET = /^\/api\/appointments\/[^/]+\/picks(\?|$)/;

export function originAllowed(request: Pick<FastifyRequest, 'method' | 'url' | 'headers'>, appOrigin: string): boolean {
  const origin = request.headers.origin;
  if (WRITE_METHODS.has(request.method)) {
    return typeof origin === 'string' && origin === appOrigin;
  }
  if (request.method === 'GET' && STATE_CHANGING_GET.test(request.url)) {
    if (typeof origin === 'string' && origin !== appOrigin) return false;
    const site = request.headers['sec-fetch-site'];
    if (site === 'cross-site' || site === 'same-site') return false;
  }
  return true;
}

export function registerOriginGuard(app: FastifyInstance, appOrigin: string): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (!originAllowed(request, appOrigin)) {
      await reply.code(403).send({
        success: false,
        error: { code: 'forbidden_origin', message: "This request must come from the app's own origin." },
      });
    }
  });
}
