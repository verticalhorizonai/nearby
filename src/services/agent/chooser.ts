// How picks are chosen for one appointment (spec 3.6): the Claude tool-use loop when it may run, otherwise the
// fallback. The agent implementation plugs in here (tasks 33, 34, 36, 37, 39, 40, 80, 81).
import type { Candidate } from '../matching/matcher.js';
import type { ChosenPick } from './fallback.js';
import type { PickSource } from '../../shared/types.js';
import type { RunReporter } from './agentActivity.js';

export interface ChooseContext {
  sessionId: string;
  appointment: { id: string; title: string; startsAt: Date; endsAt: Date; locationText: string; lat: number; lng: number };
  /** Every candidate that passed the four rules, best first. */
  candidates: Candidate[];
  /** The top two with score >= 0.35 (3.5.3): what the fallback shows. */
  shown: Candidate[];
  radiusMeters: number;
  /** Where the run reports each tool call as it starts (build ruling 43). */
  reporter?: RunReporter;
}

export type FallbackCause = 'kill_switch' | 'rate_limit' | 'model_error' | 'model_timeout' | 'invalid_output' | 'no_model_configured';

export interface ChooseResult {
  source: PickSource;
  picks: ChosenPick[];
  /** Why the fallback was used, when it was. */
  fallbackCause?: FallbackCause;
  /** For the server log line, e.g. the rate-limit counts. */
  detail?: string;
}

export interface PickChooser {
  choose(ctx: ChooseContext): Promise<ChooseResult>;
}
