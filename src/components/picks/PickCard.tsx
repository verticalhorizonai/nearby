// A pick card (F2.2, F3.1, F3.2; REQ-02-02, REQ-08-09; spec 3.11.2 The pick card; design/appointment-detail.html):
// the merchant's name with the Sample badge and the offer under it, the price at the right, the agent's reason as a
// quotation on a #F6F8F4 panel, distance and valid window with small icons, then Yes (primary, twice as wide) and
// Not now (secondary), both 48 px tall. `Pick.score` is not drawn (ruling 3).
import { CheckCircle2, Clock, MapPin } from 'lucide-react';
import type { Pick } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { formatCents, formatMiles, formatValidWindow } from '@/client/format';

interface PickCardProps {
  pick: Pick;
  onYes: (pick: Pick) => void;
  onNotNow: (pick: Pick) => void;
  /** Disables both buttons while a request for this card is in flight. */
  busy?: boolean;
  /** Fades the card out after Not now, before it is removed. */
  leaving?: boolean;
  /** The first card carries the pick shadow, as in the reference design. */
  raised?: boolean;
}

export function PickCard({ pick, onYes, onNotNow, busy = false, leaving = false, raised = true }: PickCardProps) {
  const headingId = `pick-${pick.proposalId}-name`;
  return (
    <article
      aria-labelledby={headingId}
      data-testid="pick-card"
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border bg-card p-[18px] transition-[opacity,transform] duration-200 ease-out',
        raised && 'shadow-pick',
        leaving && 'pointer-events-none -translate-y-1 opacity-0',
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 id={headingId} className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-snug">
            {pick.merchantName}
            {pick.merchantIsSample && <Badge variant="sample">Sample</Badge>}
          </h3>
          <p className="text-[15px] text-body-text">{pick.offerTitle}</p>
        </div>
        <div className="flex-none text-right">
          <div className="font-display text-price font-bold" data-testid="pick-price">
            {formatCents(pick.priceCents)}
          </div>
          {pick.regularPriceCents !== null && pick.regularPriceCents > pick.priceCents && (
            <div className="text-[13px] text-secondary-text">
              <span className="sr-only">Regular price </span>
              <s>{formatCents(pick.regularPriceCents)}</s>
            </div>
          )}
        </div>
      </div>

      <blockquote className="m-0 rounded-panel bg-background px-3.5 py-3 text-[15px] text-foreground" data-testid="pick-reason">
        &ldquo;{pick.reason}&rdquo;
      </blockquote>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-secondary-text">
        <span className="flex items-center gap-[5px]" data-testid="pick-distance">
          <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">Distance </span>
          {formatMiles(pick.distanceMeters)}
        </span>
        <span className="flex items-center gap-[5px]" data-testid="pick-window">
          <Clock className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">Valid </span>
          {formatValidWindow(pick.validWindow)}
        </span>
      </div>

      {pick.purchased ? (
        // A bought pick stays bought (3.9.1 with ruling 7): no Yes or Not now (REQ-03-12).
        <p className="flex min-h-12 items-center gap-2 rounded-panel bg-tint px-3.5 text-[15px] font-semibold text-primary" data-testid="pick-status">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          Bought. Your receipt has the redemption code.
        </p>
      ) : (
      <>
      {pick.status === 'accepted' && (
        // Yes was tapped and the payment is not finished (3.9.1 proposed -> accepted).
        <p className="text-[13px] font-semibold text-primary" data-testid="pick-status">
          You said yes to this pick. Tap Yes to pay with PayPal.
        </p>
      )}
      <div className="flex gap-2.5">
        <Button
          type="button"
          className="h-12 flex-[2_1_0%] text-base"
          onClick={() => onYes(pick)}
          disabled={busy || leaving}
          aria-label={`Yes, ${pick.offerTitle} from ${pick.merchantName}`}
        >
          Yes
        </Button>
        {pick.status !== 'accepted' && (
        <Button
          type="button"
          variant="secondary"
          className="h-12 flex-[1_1_0%] text-base"
          onClick={() => onNotNow(pick)}
          disabled={busy || leaving}
          aria-label={`Not now, ${pick.offerTitle} from ${pick.merchantName}`}
        >
          Not now
        </Button>
        )}
      </div>
      </>
      )}
    </article>
  );
}

/** The placeholder shown while the picks load; the request can take up to 20 s (REQ-03-06). */
export function PickCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-[18px]" data-testid="pick-skeleton" aria-hidden="true">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-44 rounded-tile bg-tint" />
          <Skeleton className="h-4 w-32 rounded-tile bg-tint" />
        </div>
        <Skeleton className="h-7 w-16 rounded-tile bg-tint" />
      </div>
      <Skeleton className="h-16 rounded-panel bg-background" />
      <Skeleton className="h-4 w-56 rounded-tile bg-tint" />
      <div className="flex gap-2.5">
        <Skeleton className="h-12 flex-[2_1_0%] rounded-full bg-tint" />
        <Skeleton className="h-12 flex-[1_1_0%] rounded-full bg-tint" />
      </div>
    </div>
  );
}
