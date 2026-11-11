// Seats, merchant dashboard, offers, sales feed, reset (Master Route Table; REQ-04-01..05, REQ-05-02, REQ-05-03).
import type { FastifyInstance } from 'fastify';
import { badRequest, ok, requireUuid } from './http.js';
import type { AppServices } from '../app.js';
import { validateCreateOffer } from '../validators/offerForm.js';
import { resetDemo } from '../services/demo/resetService.js';
import type { Db } from '../models/db.js';

export function registerMerchantRoutes(app: FastifyInstance, s: AppServices, db: Db): void {
  app.get('/api/seats', async (req, reply) => ok(reply, await s.merchants.seats(req.sessionId)));
  app.get<{ Params: { merchantId: string } }>('/api/merchants/:merchantId/dashboard', async (req, reply) =>
    ok(reply, await s.merchants.dashboard(requireUuid(req.params.merchantId, 'merchantId'))),
  );
  app.post<{ Params: { merchantId: string }; Body: unknown }>('/api/merchants/:merchantId/offers', async (req, reply) => {
    const merchantId = requireUuid(req.params.merchantId, 'merchantId');
    const v = validateCreateOffer(req.body);
    if (!v.ok) throw badRequest('The offer breaks a rule. Nothing was saved.', v.fieldErrors);
    return ok(reply, await s.merchants.publishOffer(merchantId, v.value), 201);
  });
  app.get<{ Params: { merchantId: string } }>('/api/merchants/:merchantId/sales-feed', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return ok(reply, await s.merchants.salesFeed(requireUuid(req.params.merchantId, 'merchantId')));
  });
  app.post('/api/demo/reset', async (req, reply) => ok(reply, await resetDemo(db, req.sessionId)));
}
