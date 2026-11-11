// The sales feed card (F5.1; REQ-04-04, REQ-04-05, REQ-08-03, REQ-08-04; spec 3.11.2 The sales feed): item, amount,
// time in America/Phoenix and redemption code in the monospaced font, newest first. A new sale slides in at the top
// and stays highlighted for 5 seconds; no slide under reduced motion.
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { formatCents, formatDayShortTime } from '@/client/format';
import { useSalesFeed } from '@/hooks/useSalesFeed';

interface SalesFeedPanelProps {
  merchantId: string;
  /** Poll and highlight timings; the defaults are the spec's 3 s and 5 s. Shorter only in tests. */
  intervalMs?: number;
  highlightMs?: number;
}

export function SalesFeedPanel({ merchantId, intervalMs, highlightMs }: SalesFeedPanelProps) {
  const { items, fresh, failing } = useSalesFeed(merchantId, intervalMs, highlightMs);

  return (
    <Card className="flex flex-col gap-4 rounded-section p-6" aria-labelledby="sales-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sales-heading" className="font-display text-2xl font-bold">
          Sales
        </h2>
        <span className="flex items-center gap-1.5 text-[13px] text-secondary-text">
          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', failing ? 'bg-outline-border' : 'bg-primary')} />
          {failing ? 'Reconnecting' : 'Live'}
        </span>
      </div>

      {items === null ? (
        failing ? (
          <p className="text-body-text">The sales feed is not reachable right now. Nearby keeps trying every few seconds.</p>
        ) : (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading sales" data-testid="sales-skeleton">
            <Skeleton className="h-[60px] rounded-panel" />
          </div>
        )
      ) : items.length === 0 ? (
        <p className="rounded-panel bg-background px-4 py-5 text-body-text" data-testid="sales-empty">
          No sales yet. Buy as the shopper and the sale appears here within a few seconds.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite" aria-label="Recent sales, newest first">
          {items.map((s) => {
            const isNew = fresh.has(s.purchaseId);
            return (
              <li
                key={s.purchaseId}
                data-testid="sale"
                data-highlighted={isNew ? 'true' : 'false'}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-panel border px-4 py-3 transition-colors duration-200',
                  isNew
                    ? 'border-primary bg-tint duration-200 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none'
                    : 'border-border bg-background',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {s.offerTitle}
                    {isNew && <span className="ml-2 text-[13px] font-semibold text-primary">New sale</span>}
                  </span>
                  <span className="block text-[13px] text-secondary-text">{formatDayShortTime(s.completedAt)}</span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="font-mono text-code font-semibold">
                    <span className="sr-only">Redemption code </span>
                    {s.redemptionCode}
                  </span>
                  <span className="font-display text-xl font-bold">{formatCents(s.amountCents)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
