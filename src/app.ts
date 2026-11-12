// The Fastify application: the HTTP API under /api and, in production, the built React client (spec 3.1).
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './models/db.js';
import type { AppConfig } from './services/config/env.js';
import type { CalendarSource } from './services/calendarMcp/client.js';
import type { PayPalAdapter } from './services/paypal/paypalAdapter.js';
import { registerSession } from './middleware/session.js';
import { registerOriginGuard } from './middleware/originGuard.js';
import { ApiError } from './api/http.js';
import { AppointmentsService } from './services/appointments/appointmentsService.js';
import { PicksService } from './services/picks/picksService.js';
import { ProposalService } from './services/proposals/proposalService.js';
import { PurchaseService } from './services/purchases/purchaseService.js';
import type { PickChooser } from './services/agent/chooser.js';
import { AgentLoop } from './services/agent/agentLoop.js';
import { AgentRateLimiter } from './services/agent/rateLimiter.js';
import { AgentActivity } from './services/agent/agentActivity.js';
import type { AnthropicAdapter } from './services/agent/anthropicAdapter.js';
import type { PlacesAdapter } from './services/places/placesAdapter.js';
import { MapService } from './services/map/mapService.js';
import { PlacesCache } from './services/places/placesCache.js';
import { isAgentDisabled } from './services/config/env.js';
import { registerCalendarRoutes } from './api/calendarRoutes.js';
import { registerPurchaseRoutes } from './api/purchaseRoutes.js';
import { registerConfigRoutes } from './api/configRoutes.js';
import { registerMerchantRoutes } from './api/merchantRoutes.js';
import { MerchantDirectory } from './services/merchants/merchantDirectory.js';
import { registerMcpRoutes } from './api/mcpRoutes.js';
import { registerHandoffRoutes } from './api/handoffRoutes.js';
import { OfferSearch } from './services/offersMcp/offerSearch.js';
import { WindowLimiter } from './services/offersMcp/windowLimiter.js';
import { HandoffService } from './services/handoff/handoffService.js';
import { HANDOFFS_PER_SESSION_PER_HOUR, MCP_REQUESTS_PER_ADDRESS_PER_MINUTE } from './shared/types.js';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  calendar: CalendarSource;
  paypal: PayPalAdapter;
  places: PlacesAdapter;
  /** Claude through the Messages API; null when ANTHROPIC_API_KEY or ANTHROPIC_MODEL is not set (every pick then comes from the fallback). */
  anthropic: AnthropicAdapter | null;
  /** Replaces the agent loop (tests only). */
  chooser?: PickChooser;
  limiter?: AgentRateLimiter;
  isAgentDisabled?: () => boolean;
  now?: () => Date;
  /** Where the built client lives; the server serves it when it exists. */
  clientDir?: string;
  logger?: boolean;
}

export interface AppServices {
  appointments: AppointmentsService;
  picks: PicksService;
  proposals: ProposalService;
  purchases: PurchaseService;
  merchants: MerchantDirectory;
  map: MapService;
  rateLimiter: AgentRateLimiter;
  /** The read-only offer search behind /mcp (build ruling 42). */
  offerSearch: OfferSearch;
  /** The checkout handoff (build ruling 42). */
  handoff: HandoffService;
  /** The agent's runs in flight, step by step (build ruling 43). */
  activity: AgentActivity;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance & { services: AppServices }> {
  const app = Fastify({ logger: deps.logger ?? false });
  const now = deps.now ?? (() => new Date());
  const log = (msg: string) => app.log.warn(msg);
  const appointments = new AppointmentsService(deps.db, deps.calendar, now);
  const rateLimiter = deps.limiter ?? new AgentRateLimiter();
  const placesCache = new PlacesCache(deps.places);
  const chooser =
    deps.chooser ??
    new AgentLoop({ db: deps.db, calendar: deps.calendar, places: placesCache, anthropic: deps.anthropic, limiter: rateLimiter, isDisabled: deps.isAgentDisabled ?? (() => isAgentDisabled()), now });
  const activity = new AgentActivity(now);
  const picks = new PicksService(deps.db, appointments, chooser, now, log, activity);
  const services: AppServices = {
    appointments,
    picks,
    rateLimiter,
    activity,
    map: new MapService(deps.db, picks, placesCache, !!deps.config.googleMapsBrowserKey, log),
    proposals: new ProposalService(deps.db, now),
    purchases: new PurchaseService(deps.db, deps.paypal, deps.config.appBaseUrl, now, log),
    merchants: new MerchantDirectory(deps.db, deps.calendar, now),
    offerSearch: new OfferSearch(deps.db, deps.config.appBaseUrl, now),
    handoff: new HandoffService(deps.db, new WindowLimiter(HANDOFFS_PER_SESSION_PER_HOUR, 3_600_000, () => now().getTime()), now),
  };

  await app.register(cookie);
  registerSession(app, { secure: deps.config.appBaseUrl.startsWith('https://') });
  registerOriginGuard(app, deps.config.appOrigin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({
        success: false,
        error: { code: err.code, message: err.message, ...(err.fieldErrors ? { details: { fieldErrors: err.fieldErrors } } : {}) },
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(400).send({ success: false, error: { code: 'validation_error', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.code(500).send({ success: false, error: { code: 'internal_error', message: 'Something went wrong. Try again.' } });
  });

  registerCalendarRoutes(app, services);
  registerPurchaseRoutes(app, services);
  registerConfigRoutes(app, deps.config);
  registerMerchantRoutes(app, services, deps.db);
  registerHandoffRoutes(app, services.handoff);
  registerMcpRoutes(app, services.offerSearch, new WindowLimiter(MCP_REQUESTS_PER_ADDRESS_PER_MINUTE, 60_000, () => now().getTime()));

  const clientDir = deps.clientDir ?? fileURLToPath(new URL('../client/', import.meta.url));
  const hasClient = existsSync(`${clientDir}/index.html`);
  if (hasClient) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (hasClient && req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ success: false, error: { code: 'not_found', message: 'Not found' } });
  });

  (app as unknown as { services: AppServices }).services = services;
  return app as unknown as FastifyInstance & { services: AppServices };
}
