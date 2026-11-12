// The checkout handoff page (build ruling 42): where an outside assistant's checkout_url lands. Opening it changes
// nothing: it shows the offer with its Sample badge, the price from Nearby's database, the place and the time, and one
// button, "Review in Nearby". The button adds the stop and its pick to this browser's session and opens the stop's
// page, where the person decides with Yes and approves on PayPal, as for any pick. Everything from the link is shown
// as text.
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { HandoffParams, HandoffPreview, HandoffResult } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, isApiError, useApiQuery } from '@/hooks/useApi';
import { SHOPPER_SEAT, writeSeat } from '@/hooks/useSeat';
import { formatCents, formatDayTimeRange, formatValidWindow } from '@/client/format';

/** The link's own query, passed on as it came: the offer, the place, the start and an optional title. */
function linkParams(search: string): Partial<HandoffParams> {
  const q = new URLSearchParams(search);
  const out: Partial<HandoffParams> = {};
  for (const key of ['offer', 'lat', 'lng', 'at', 'title'] as const) {
    const v = q.get(key);
    if (v !== null) out[key] = v;
  }
  return out;
}

export function HandoffPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = linkParams(search);
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const preview = useApiQuery<HandoffPreview>(`/api/handoff?${query}`);
  const [busy, setBusy] = useState(false);
  const p = preview.data;

  // "Review in Nearby": a POST under the origin rule; the server re-checks the offer before it adds anything.
  const review = async () => {
    setBusy(true);
    try {
      const result = await api.post<HandoffResult>('/api/handoff', params);
      writeSeat(SHOPPER_SEAT);
      navigate(`/appointments/${encodeURIComponent(result.appointmentId)}`);
    } catch (e) {
      setBusy(false);
      if (isApiError(e) && e.code === 'offer_unavailable') preview.reload();
      else if (isApiError(e) && e.status === 429) toast(e.message);
      else toast.error('Could not add this stop just now. Try again in a moment.');
    }
  };

  let body;
  if (preview.loading && !p) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the offer">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-12 w-full rounded-card" />
      </div>
    );
  } else if (preview.error || !p) {
    body = (
      <ErrorState
        title="This link does not open an offer"
        message={preview.error?.status === 404 ? 'The offer in this link is not in Nearby.' : 'The link is missing a part or has one Nearby cannot read.'}
      >
        <Link to="/week" className="flex min-h-touch items-center px-2 font-semibold">
          Open My week
        </Link>
      </ErrorState>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <article aria-labelledby="handoff-merchant" className="flex flex-col gap-3 rounded-card border border-border bg-card p-[18px] shadow-pick" data-testid="handoff-card">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <h2 id="handoff-merchant" className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-snug">
                {p.merchantName}
                {p.merchantIsSample && <Badge variant="sample">Sample</Badge>}
              </h2>
              <p className="text-[15px] text-body-text">{p.offerTitle}</p>
            </div>
            <div className="flex-none text-right">
              <div className="font-display text-price font-bold" data-testid="handoff-price">
                {formatCents(p.priceCents)}
              </div>
              {p.isDeposit && <div className="text-[13px] text-secondary-text">Deposit</div>}
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[15px]">
            <dt className="text-secondary-text">Stop</dt>
            <dd className="m-0 break-words font-semibold" data-testid="handoff-title">
              {p.title}
            </dd>
            <dt className="text-secondary-text">When</dt>
            <dd className="m-0">{formatDayTimeRange(p.startsAt, p.endsAt)}</dd>
            <dt className="text-secondary-text">Place</dt>
            <dd className="m-0">{p.address}</dd>
            <dt className="text-secondary-text">Deal runs</dt>
            <dd className="m-0">{formatValidWindow(p.validWindow)}</dd>
          </dl>
        </article>
        {p.fits ? (
          <>
            <Button type="button" className="w-full" onClick={() => void review()} disabled={busy} data-testid="review-in-nearby">
              Review in Nearby
            </Button>
            <p className="text-center text-[13px] text-secondary-text">
              Nothing is bought here. In Nearby you choose Yes and approve the payment on PayPal.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card px-[18px] py-6 text-center" data-testid="handoff-no-longer-fits">
            <p className="text-[17px] font-semibold">{p.note}</p>
            <Link to="/week" className="flex min-h-touch items-center px-2 font-semibold">
              Open My week
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <PageShell side="shopper" mainClassName="pt-6">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold leading-tight">From your assistant</h1>
          <p className="text-body-text">Your assistant found this offer with Nearby. Review it here; nothing is added until you choose to.</p>
        </div>
        {body}
      </div>
    </PageShell>
  );
}
