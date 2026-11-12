// The checkout handoff (build ruling 42). GET /api/handoff reads only: the handoff page shows the offer from it.
// POST /api/handoff is the "Review in Nearby" button: a state change, so the origin rule applies (originGuard).
import type { FastifyInstance } from 'fastify';
import type { HandoffParams } from '../shared/types.js';
import { ok } from './http.js';
import type { HandoffService } from '../services/handoff/handoffService.js';

export function registerHandoffRoutes(app: FastifyInstance, handoff: HandoffService): void {
  app.get<{ Querystring: Partial<HandoffParams> }>('/api/handoff', async (req, reply) => ok(reply, await handoff.preview(req.query ?? {})));
  app.post<{ Body: Partial<HandoffParams> }>('/api/handoff', async (req, reply) => {
    const result = await handoff.accept(req.sessionId, (req.body ?? {}) as Partial<HandoffParams>);
    return ok(reply, result, result.created ? 201 : 200);
  });
}
