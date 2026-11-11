// The merchant's offers, newest first (F4.1, F4.2 step 4; REQ-04-01, REQ-04-02): title, category, valid window, price
// with the regular price struck through, and a deposit note. Offers are live from the moment they are published.
import type { Offer } from '@/shared/types';
import { CATEGORY_LABEL, formatCents, formatValidWindow } from '@/client/format';
import { cn } from '@/components/ui/cn';

export function OffersList({ offers, freshId }: { offers: Offer[]; freshId: string | null }) {
  if (offers.length === 0) {
    return <p className="rounded-panel bg-background px-4 py-5 text-body-text">No offers yet. Post one and shoppers nearby see it at once.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Offers, newest first">
      {offers.map((o) => (
        <li
          key={o.id}
          data-testid="offer-row"
          className={cn(
            'flex items-start justify-between gap-3 rounded-panel border px-4 py-3',
            o.id === freshId ? 'border-primary bg-tint animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none' : 'border-border bg-background',
          )}
        >
          <div className="min-w-0">
            <p className="font-semibold">{o.title}</p>
            <p className="text-[13px] text-secondary-text">
              {CATEGORY_LABEL[o.category]} · {formatValidWindow(o)}
            </p>
            {o.isDeposit && <p className="text-[13px] font-semibold text-primary">Deposit, redeemed in store</p>}
          </div>
          <div className="flex-none text-right">
            <p className="font-display text-xl font-bold">{formatCents(o.priceCents)}</p>
            {o.regularPriceCents !== null && (
              <p className="text-[13px] text-secondary-text">
                <span className="sr-only">Regular price </span>
                <s>{formatCents(o.regularPriceCents)}</s>
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
