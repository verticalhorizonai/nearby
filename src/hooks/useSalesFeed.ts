// The live sales feed (F5.1; REQ-04-04, REQ-04-05; spec 3.8): polls `GET /api/merchants/{id}/sales-feed` every
// SALES_FEED_POLL_INTERVAL_MS (3 s), keeps the SALES_FEED_MAX_ITEMS (20) newest first, and marks a sale that arrived
// after the first poll as fresh for SALES_FEED_NEW_SALE_HIGHLIGHT_MS (5 s). A failed poll keeps the last list and
// tries again on the next tick.
import { useEffect, useState } from 'react';
import type { SalesFeed, SalesFeedItem } from '@/shared/types';
import { SALES_FEED_MAX_ITEMS, SALES_FEED_NEW_SALE_HIGHLIGHT_MS, SALES_FEED_POLL_INTERVAL_MS } from '@/shared/types';
import { api } from './useApi';

export interface SalesFeedState {
  /** Null until the first poll answers. */
  items: SalesFeedItem[] | null;
  /** Purchase ids highlighted as new. */
  fresh: ReadonlySet<string>;
  /** The last poll failed. */
  failing: boolean;
}

export function useSalesFeed(
  merchantId: string,
  intervalMs: number = SALES_FEED_POLL_INTERVAL_MS,
  highlightMs: number = SALES_FEED_NEW_SALE_HIGHLIGHT_MS,
): SalesFeedState {
  const [items, setItems] = useState<SalesFeedItem[] | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    let live = true;
    let next: number | undefined;
    let known: Set<string> | null = null;
    const highlightTimers: number[] = [];
    setItems(null);
    setFresh(new Set());

    const poll = async () => {
      // Fixed rate (PERF-04-04-01): the next poll is due intervalMs after this one STARTED, so response time does not
      // stretch the 3-second cadence.
      const startedAt = Date.now();
      try {
        const feed = await api.get<SalesFeed>(`/api/merchants/${encodeURIComponent(merchantId)}/sales-feed`);
        if (!live) return;
        const list = [...feed.items].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, SALES_FEED_MAX_ITEMS);
        if (known) {
          const seen = known;
          const added = list.filter((i) => !seen.has(i.purchaseId)).map((i) => i.purchaseId);
          if (added.length > 0) {
            setFresh((prev) => new Set([...prev, ...added]));
            highlightTimers.push(
              window.setTimeout(() => {
                setFresh((prev) => {
                  const n = new Set(prev);
                  added.forEach((id) => n.delete(id));
                  return n;
                });
              }, highlightMs),
            );
          }
        }
        known = new Set(list.map((i) => i.purchaseId));
        setItems(list);
        setFailing(false);
      } catch {
        if (live) setFailing(true);
      } finally {
        if (live) next = window.setTimeout(() => void poll(), Math.max(0, intervalMs - (Date.now() - startedAt)));
      }
    };
    void poll();

    return () => {
      live = false;
      window.clearTimeout(next);
      highlightTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [merchantId, intervalMs, highlightMs]);

  return { items, fresh, failing };
}
