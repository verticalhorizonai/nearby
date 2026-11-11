// Choose a seat (F6.2, F6.3, F4.1; REQ-05-02, REQ-05-03, REQ-05-07; spec 3.11.1; design/choose-a-seat.html): the
// heading and line, the Shopper seat with its five tiles, the eight sample merchants each one tap, the tip beside
// Merchants, and Reset demo in the page header. Data from `GET /api/seats`.
import type { ChooseSeatData } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MerchantGrid, MerchantGridSkeleton } from '@/components/seats/MerchantSeatCardLink';
import { ResetDemoButton } from '@/components/seats/ResetDemoButton';
import { ShopperSeatCard } from '@/components/seats/ShopperSeatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/useApi';

const label = 'text-label uppercase text-secondary-text';

export function ChooseSeatPage() {
  const seats = useApiQuery<ChooseSeatData>('/api/seats');

  return (
    <PageShell
      side="public"
      header={
        <SiteHeader>
          <ResetDemoButton />
        </SiteHeader>
      }
      mainClassName="flex flex-col gap-9 pb-16 pt-7"
    >
      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-[-0.02em]">Choose a seat</h1>
        <p className="max-w-[640px] text-lg text-body-text">
          A seat is not a sign-in. It only picks which side of Nearby you see, and you can switch at any time.
        </p>
      </div>

      {seats.error ? (
        <ErrorState title="The seats did not load" onRetry={seats.reload} />
      ) : (
        <>
          <section aria-labelledby="shopper-label" className="flex flex-col gap-3.5">
            <h2 id="shopper-label" className={label}>
              Shopper
            </h2>
            {seats.data ? <ShopperSeatCard data={seats.data.shopper} /> : <Skeleton className="h-[220px] rounded-section" />}
          </section>

          <section aria-labelledby="merchants-label" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="merchants-label" className={label}>
                Merchants
              </h2>
              <p className="text-sm text-secondary-text">Tip: open a merchant in a second window to watch a sale arrive.</p>
            </div>
            {seats.data ? <MerchantGrid cards={seats.data.merchants} /> : <MerchantGridSkeleton />}
          </section>
        </>
      )}
    </PageShell>
  );
}
