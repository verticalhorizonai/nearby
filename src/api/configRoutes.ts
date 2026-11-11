// GET /api/config/public (task 84; REQ-05-01, REQ-02-01, REQ-07-03): browser-safe configuration only — the footer's
// repository link (shown only when APP_REPO_URL is set) and the browser-restricted Maps key. No secret is ever sent.
import type { FastifyInstance } from 'fastify';
import type { PublicConfig } from '../shared/types.js';
import type { AppConfig } from '../services/config/env.js';
import { ok } from './http.js';

export function publicConfig(config: AppConfig): PublicConfig {
  return { repoUrl: config.repoUrl, googleMapsBrowserKey: config.googleMapsBrowserKey };
}

export function registerConfigRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/config/public', async (_req, reply) => ok(reply, publicConfig(config)));
}
