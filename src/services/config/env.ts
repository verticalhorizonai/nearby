// Configuration from environment variables only (spec 3.7.3, 3.13; REQ-07-03). No credential is ever in the repository.
import { PAYPAL_SANDBOX_BASE_URL } from '../../shared/types.js';

export interface AppConfig {
  databaseUrl: string;
  /** APP_BASE_URL without a trailing slash, e.g. https://nearby.example.app */
  appBaseUrl: string;
  /** The origin of APP_BASE_URL (scheme, host, port): the only origin a state-changing request is accepted from. */
  appOrigin: string;
  anthropicApiKey: string | null;
  anthropicModel: string | null;
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  paypalBaseUrl: string;
  googleMapsServerKey: string | null;
  googleMapsBrowserKey: string | null;
  repoUrl: string | null;
  port: number;
}

export class ConfigError extends Error {}

const opt = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const v = env[name];
  return v && v.trim() !== '' ? v.trim() : null;
};

/** Reads the configuration. Throws ConfigError naming the variable when a required one is missing or invalid. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = opt(env, 'DATABASE_URL');
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is not set. Set it to the PostgreSQL connection string.');
  const base = opt(env, 'APP_BASE_URL');
  if (!base) throw new ConfigError('APP_BASE_URL is not set. Set it to the public URL of the app, e.g. https://nearby.example.app');
  let appOrigin: string;
  try {
    appOrigin = new URL(base).origin;
  } catch {
    throw new ConfigError(`APP_BASE_URL is not a URL: ${base}`);
  }
  return {
    databaseUrl,
    appBaseUrl: base.replace(/\/+$/, ''),
    appOrigin,
    anthropicApiKey: opt(env, 'ANTHROPIC_API_KEY'),
    anthropicModel: opt(env, 'ANTHROPIC_MODEL'),
    paypalClientId: opt(env, 'PAYPAL_CLIENT_ID'),
    paypalClientSecret: opt(env, 'PAYPAL_CLIENT_SECRET'),
    paypalBaseUrl: opt(env, 'PAYPAL_BASE_URL') ?? '',
    googleMapsServerKey: opt(env, 'GOOGLE_MAPS_SERVER_KEY'),
    googleMapsBrowserKey: opt(env, 'GOOGLE_MAPS_BROWSER_KEY'),
    repoUrl: opt(env, 'APP_REPO_URL'),
    port: Number(env.PORT) > 0 ? Number(env.PORT) : 3000,
  };
}

/** The kill switch (spec 3.6.4; REQ-06-04): read on every request, so flipping it needs no restart.
 * On only when AGENT_DISABLED reads "true" after trimming, in any case (build ruling 15(g)). */
export function isAgentDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AGENT_DISABLED ?? '').trim().toLowerCase() === 'true';
}

export { PAYPAL_SANDBOX_BASE_URL };
