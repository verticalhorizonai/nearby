// The PayPal return and cancel pages (F3.1 step 5; REQ-03-01, REQ-03-10, REQ-03-12, REQ-08-06). On load the page
// calls `POST /api/pay/return/{proposalId}` or `POST /api/pay/cancel/{proposalId}` once (guarded against React
// StrictMode's double effect). Completed: the receipt and a success toast. Failed: the toast "Payment did not go
// through. Nothing was charged." and back to the pick, which is available again.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { PaymentReturnResult, Receipt } from '@/shared/types';
import { PAYMENT_FAILED_MESSAGE } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ReceiptCard } from '@/components/picks/ReceiptCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/hooks/useApi';
import { clearPendingPayment, readPendingPayment } from '@/client/pendingPayment';

type Kind = 'return' | 'cancel';

type View = { state: 'loading' } | { state: 'receipt'; receipt: Receipt } | { state: 'error' } | { state: 'missing' };

export function PaymentResultPage({ kind }: { kind: Kind }) {
  const [params] = useSearchParams();
  const proposalId = params.get('proposalId') ?? '';
  const navigate = useNavigate();
  const started = useRef<string | null>(null);
  const [view, setView] = useState<View>(proposalId ? { state: 'loading' } : { state: 'missing' });

  useEffect(() => {
    if (!proposalId || started.current === proposalId) return;
    started.current = proposalId;

    api
      .post<PaymentReturnResult>(`/api/pay/${kind}/${encodeURIComponent(proposalId)}`)
      .then((result) => {
        if (result.outcome === 'completed') {
          clearPendingPayment(proposalId);
          setView({ state: 'receipt', receipt: result.receipt });
          toast.success(`Paid ${result.receipt.merchantName}. Your code is ${result.receipt.redemptionCode}.`);
          return;
        }
        // Failed or cancelled: the proposal is back to proposed; return to the pick (spec 3.7.4).
        toast.error(PAYMENT_FAILED_MESSAGE);
        const appointmentId = readPendingPayment(proposalId);
        clearPendingPayment(proposalId);
        navigate(appointmentId ? `/appointments/${encodeURIComponent(appointmentId)}` : '/week', { replace: true });
      })
      .catch(() => setView({ state: 'error' }));
  }, [kind, proposalId, navigate]);

  let body;
  if (view.state === 'receipt') {
    body = (
      <>
        <ReceiptCard receipt={view.receipt} />
        <Button asChild size="lg" variant="secondary" className="self-start">
          <Link to="/week" className="text-foreground no-underline hover:text-foreground">
            Back to my week
          </Link>
        </Button>
      </>
    );
  } else if (view.state === 'loading') {
    body = (
      <div className="flex flex-col gap-4 rounded-section border border-border bg-card p-6" aria-busy="true">
        <p className="font-semibold">{kind === 'return' ? 'Confirming your payment with PayPal…' : 'Returning to your pick…'}</p>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full rounded-panel" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  } else {
    body = (
      <ErrorState
        title={view.state === 'missing' ? 'This payment link is incomplete' : 'We could not check this payment'}
        message={
          view.state === 'missing'
            ? 'Go back to My week and open the pick again.'
            : 'Nearby could not confirm the payment just now. If it went through, the receipt shows when you open this page again.'
        }
        onRetry={view.state === 'error' ? () => window.location.reload() : undefined}
      >
        <Link to="/week" className="flex min-h-touch items-center px-2 font-semibold">
          Back to my week
        </Link>
      </ErrorState>
    );
  }

  return (
    <PageShell side="shopper" mainClassName="pt-8">
      <div className="mx-auto flex max-w-lg flex-col gap-4">{body}</div>
    </PageShell>
  );
}
