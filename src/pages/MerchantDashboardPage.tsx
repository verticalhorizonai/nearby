// Merchant dashboard (F4.1, F4.2, F5.1; REQ-04-01..05, REQ-05-04, REQ-08-01; spec 3.8): the header chip
// "Merchant: {name} (Sample)", the profile card, the offers list with New offer, and the live sales feed. From
// 900 px the offers sit on the left and the sales on the right; on a phone they stack.
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { MerchantDashboard, Offer } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MerchantProfileCard } from '@/components/merchant/MerchantProfileCard';
import { OfferForm } from '@/components/merchant/OfferForm';
import { OffersList } from '@/components/merchant/OffersList';
import { SalesFeedPanel } from '@/components/merchant/SalesFeedPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/useApi';
import { useSeat } from '@/hooks/useSeat';

export function MerchantDashboardPage() {
  const { merchantId = '' } = useParams();
  const dash = useApiQuery<MerchantDashboard>(`/api/merchants/${encodeURIComponent(merchantId)}/dashboard`);
  const { seat, setSeat } = useSeat();
  const [formOpen, setFormOpen] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const merchant = dash.data?.merchant;

  // REQ-05-04: the seat chip names this merchant, e.g. "Merchant: Saguaro Bean Co. (Sample)".
  useEffect(() => {
    if (!merchant) return;
    if (seat?.seat !== 'merchant' || seat.merchantId !== merchant.id || seat.merchantName !== merchant.name) {
      setSeat({ seat: 'merchant', merchantId: merchant.id, merchantName: merchant.name, merchantIsSample: merchant.isSample });
    }
  }, [merchant, seat, setSeat]);

  const onPublished = (offer: Offer) => {
    dash.setData((prev) => (prev ? { ...prev, offers: [offer, ...prev.offers.filter((o) => o.id !== offer.id)] } : prev));
    setFreshId(offer.id);
    setFormOpen(false);
    toast.success(`Offer published: ${offer.title}. It is live now.`);
  };

  if (dash.error) {
    const missing = dash.error.status === 404 || dash.error.status === 400;
    return (
      <PageShell side="merchant" mainClassName="pt-8">
        <ErrorState
          title={missing ? 'This merchant is not here' : 'The dashboard did not load'}
          message={missing ? 'Choose one of the eight sample merchants instead.' : undefined}
          onRetry={missing ? undefined : dash.reload}
        >
          <Link to="/merchant" className="flex min-h-touch items-center px-2 font-semibold">
            See the sample merchants
          </Link>
        </ErrorState>
      </PageShell>
    );
  }

  return (
    <PageShell side="merchant" mainClassName="flex flex-col gap-6 pt-6">
      {dash.data ? <MerchantProfileCard merchant={dash.data.merchant} /> : <Skeleton className="h-[180px] rounded-section" aria-label="Loading the merchant" />}

      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 rounded-section p-6" aria-labelledby="offers-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="offers-heading" className="font-display text-2xl font-bold">
              Offers
            </h2>
            {!formOpen && (
              <Button type="button" onClick={() => setFormOpen(true)} disabled={!dash.data}>
                <Plus aria-hidden="true" />
                New offer
              </Button>
            )}
          </div>
          {formOpen && (
            <div className="rounded-panel border border-border bg-background p-4 sm:p-5">
              <OfferForm merchantId={merchantId} onPublished={onPublished} onCancel={() => setFormOpen(false)} />
            </div>
          )}
          {dash.data ? (
            <OffersList offers={dash.data.offers} freshId={freshId} />
          ) : (
            <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading offers">
              <Skeleton className="h-[68px] rounded-panel" />
              <Skeleton className="h-[68px] rounded-panel" />
            </div>
          )}
        </Card>

        <SalesFeedPanel merchantId={merchantId} />
      </div>
    </PageShell>
  );
}
