// Calendar and appointment routes (Master Route Table; REQ-01-01, REQ-01-02, REQ-01-03, REQ-01-05).
import type { FastifyInstance } from 'fastify';
import { badRequest, ok, requireUuid } from './http.js';
import type { AppServices } from '../app.js';

export function registerCalendarRoutes(app: FastifyInstance, s: AppServices): void {
  app.post('/api/calendar/demo-connection', async (req, reply) => ok(reply, await s.appointments.connectDemo(req.sessionId)));
  app.get('/api/calendar/connection', async (req, reply) => ok(reply, await s.appointments.getConnection(req.sessionId)));
  app.get('/api/appointments/upcoming', async (req, reply) => ok(reply, await s.appointments.upcoming(req.sessionId)));
  app.patch<{ Params: { appointmentId: string }; Body: unknown }>('/api/appointments/:appointmentId', async (req, reply) => {
    const id = requireUuid(req.params.appointmentId, 'appointmentId');
    const body = req.body as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== 'boolean') throw badRequest('enabled must be true or false');
    return ok(reply, await s.appointments.setEnabled(req.sessionId, id, body.enabled));
  });
}
