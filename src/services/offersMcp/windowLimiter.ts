// A process-local sliding-window limit by key (build ruling 42): requests to /mcp per client address per minute, and
// checkout handoffs per browser session per hour. Like the agent's limits (data-model §8 item 4), nothing is stored.

export class WindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Counts one request for the key; false when the key already had `limit` requests in the window. */
  take(key: string): boolean {
    const t = this.now();
    if (this.hits.size > 10_000) this.sweep(t);
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }

  /** Drops keys with no request left in the window, so the map stays small. */
  private sweep(t: number): void {
    for (const [k, list] of this.hits) if (!list.some((x) => x > t - this.windowMs)) this.hits.delete(k);
  }
}
