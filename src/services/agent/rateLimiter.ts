// Agent rate limit (tasks 40, 80; REQ-06-03; spec 3.6.4): at most 30 requests per session per hour and 300 per hour
// across all sessions. A request over either limit is answered from the fallback, not refused. Process-local sliding
// windows (data-model §8 item 4); every request to the picks route counts (build ruling 15(e)).
import { AGENT_RATE_LIMIT_GLOBAL_PER_HOUR, AGENT_RATE_LIMIT_PER_SESSION_PER_HOUR } from '../../shared/types.js';

const HOUR_MS = 3_600_000;

export class AgentRateLimiter {
  private readonly perSession = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  private prune(list: number[], t: number): number[] {
    let i = 0;
    while (i < list.length && list[i] <= t - HOUR_MS) i++;
    return i === 0 ? list : list.slice(i);
  }

  /** Records one request to the agent endpoint. */
  count(sessionId: string): void {
    const t = this.now();
    this.global = this.prune(this.global, t);
    this.global.push(t);
    const s = this.prune(this.perSession.get(sessionId) ?? [], t);
    s.push(t);
    this.perSession.set(sessionId, s);
  }

  /** True when the session's or everyone's requests in the last hour exceed the limits (the current one included). */
  overLimit(sessionId: string): boolean {
    const t = this.now();
    const s = this.prune(this.perSession.get(sessionId) ?? [], t);
    this.global = this.prune(this.global, t);
    return s.length > AGENT_RATE_LIMIT_PER_SESSION_PER_HOUR || this.global.length > AGENT_RATE_LIMIT_GLOBAL_PER_HOUR;
  }

  /** Current counts, for the operator's log line (task 80). */
  counts(sessionId: string): { session: number; global: number } {
    const t = this.now();
    return { session: this.prune(this.perSession.get(sessionId) ?? [], t).length, global: this.prune(this.global, t).length };
  }
}
