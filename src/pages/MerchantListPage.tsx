// /merchant (F4.1; REQ-04-01; spec 3.8, 3.11.1): the eight sample merchants, each with a Sample badge. The same list
// and cards as Choose a seat; a card opens that merchant's dashboard. No login in the demo.
import type { ChooseSeatData } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MerchantGrid, MerchantGridSkeleton } from '@/components/seats/MerchantSeatCardLink';
import { useApiQuery } from '@/hooks/useApi';

export function MerchantListPage() {
  const seats = useApiQuery<ChooseSeatData>('/api/seats');
  return (
    <PageShell side="merchant" mainClassName="flex flex-col gap-6 pt-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold">Sample merchants</h1>
        <p className="text-body-text">Choose a merchant to open its dashboard. Tip: open a merchant in a second window to watch a sale arrive.</p>
      </div>
      {seats.error ? (
        <ErrorState title="The merchants did not load" onRetry={seats.reload} />
      ) : seats.data ? (
        <MerchantGrid cards={seats.data.merchants} />
      ) : (
        <MerchantGridSkeleton />
      )}
    </PageShell>
  );
}
