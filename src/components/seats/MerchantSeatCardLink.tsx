// A sample merchant card (F6.3, F4.1; REQ-05-03, REQ-04-01, REQ-08-05; design/choose-a-seat.html): name, Sample badge,
// "type, area", and its offer with the price. One tap puts the visitor in that merchant's seat and opens its
// dashboard. Used on Choose a seat and on /merchant, which shows the same list (spec 3.11.1).
import { Link } from 'react-router-dom';
import type { MerchantSeatCard } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/client/format';
import { writeSeat } from '@/hooks/useSeat';

export function MerchantSeatCardLink({ card }: { card: MerchantSeatCard }) {
  return (
    <Link
      to={`/merchant/${card.merchantId}`}
      onClick={() => writeSeat({ seat: 'merchant', merchantId: card.merchantId, merchantName: card.name, merchantIsSample: card.isSample })}
      data-testid="merchant-card"
      aria-label={`${card.name}${card.isSample ? ', sample merchant' : ''}: ${card.offerTitle}, ${formatCents(card.offerPriceCents)}${card.offerIsDeposit ? " deposit" : ""}`}
      className="flex min-h-touch w-full flex-col gap-2.5 rounded-card border border-border bg-card p-5 text-foreground no-underline transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary hover:text-foreground hover:shadow-pick focus-visible:border-primary motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[17px] font-bold">{card.name}</span>
        {card.isSample && (
          <Badge variant="sample" className="flex-none">
            Sample
          </Badge>
        )}
      </div>
      <span className="text-sm text-secondary-text">
        {card.type}, {card.area}
      </span>
      <span className="mt-auto flex justify-between gap-2 border-t border-divider pt-2.5 text-sm">
        <span>{card.offerTitle}</span>
        <span className="font-bold">{formatCents(card.offerPriceCents)}{card.offerIsDeposit ? " deposit" : ""}</span>
      </span>
    </Link>
  );
}

/** The merchant grid: cards at least 240 px wide, wrapping by themselves (REQ-08-01). */
export function MerchantGrid({ cards }: { cards: MerchantSeatCard[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4 p-0" aria-label="Sample merchants">
      {cards.map((c) => (
        <li key={c.merchantId} className="flex">
          <MerchantSeatCardLink card={c} />
        </li>
      ))}
    </ul>
  );
}

/** Eight placeholder cards while `GET /api/seats` loads. */
export function MerchantGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4" aria-busy="true" aria-label="Loading the sample merchants">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-[148px] rounded-card" />
      ))}
    </div>
  );
}
