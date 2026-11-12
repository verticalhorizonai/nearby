// Picks, Yes, Not now, Pay, return and cancel (Master Route Table; REQ-02-02, REQ-03-01, REQ-03-02, REQ-03-07..12).
import type { FastifyInstance } from 'fastify';
import { badRequest, ok, requireUuid } from './http.js';
import type { AppServices } from '../app.js';

export function registerPurchaseRoutes(app: FastifyInstance, s: AppServices): void {
  app.get<{ Params: { appointmentId: string } }>('/api/appointments/:appointmentId/picks', async (req, reply) => {
    const id = requireUuid(req.params.appointmentId, 'appointmentId');
    s.rateLimiter.count(req.sessionId); // every request to the agent endpoint counts (3.6.4)
    return ok(reply, await s.picks.picks(req.sessionId, id));
  });
  app.get<{ Params: { appointmentId: string } }>('/api/appointments/:appointmentId/map', async (req, reply) =>
    ok(reply, await s.map.mapData(req.sessionId, requireUuid(req.params.appointmentId, 'appointmentId'))),
  );
  // Show hidden picks again (build ruling 40). A POST, so the origin rule applies; it is not the agent endpoint, so it
  // never counts toward the rate limit and never starts a run.
  app.post<{ Params: { appointmentId: string } }>('/api/appointments/:appointmentId/picks/restore', async (req, reply) =>
    ok(reply, await s.proposals.restoreDeclined(req.sessionId, requireUuid(req.params.appointmentId, 'appointmentId'))),
  );
  app.post<{ Params: { proposalId: string } }>('/api/proposals/:proposalId/accept', async (req, reply) =>
    ok(reply, await s.proposals.accept(req.sessionId, requireUuid(req.params.proposalId, 'proposalId'))),
  );
  app.get<{ Params: { proposalId: string } }>('/api/proposals/:proposalId/receipt', async (req, reply) =>
    ok(reply, await s.purchases.viewReceipt(req.sessionId, requireUuid(req.params.proposalId, 'proposalId'))),
  );
  app.post<{ Params: { proposalId: string } }>('/api/proposals/:proposalId/decline', async (req, reply) =>
    ok(reply, await s.proposals.decline(req.sessionId, requireUuid(req.params.proposalId, 'proposalId'))),
  );
  app.post<{ Body: unknown }>('/api/purchases', async (req, reply) => {
    const body = (req.body ?? {}) as { proposalId?: unknown; confirmationToken?: unknown };
    if (body.proposalId === undefined) throw badRequest('proposalId is required');
    const proposalId = requireUuid(body.proposalId, 'proposalId');
    // Only proposalId and confirmationToken are read; any amount, price or currency field is ignored (3.7.4).
    return ok(reply, await s.purchases.start(req.sessionId, proposalId, body.confirmationToken), 201);
  });
  app.post<{ Params: { proposalId: string } }>('/api/pay/return/:proposalId', async (req, reply) =>
    ok(reply, await s.purchases.handleReturn(req.sessionId, requireUuid(req.params.proposalId, 'proposalId'))),
  );
  app.post<{ Params: { proposalId: string } }>('/api/pay/cancel/:proposalId', async (req, reply) =>
    ok(reply, await s.purchases.handleCancel(req.sessionId, requireUuid(req.params.proposalId, 'proposalId'))),
  );
}
