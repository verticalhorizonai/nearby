// A bought pick (build ruling 38): "Bought" and "Show redemption code", which opens the existing dialog holding the
// existing receipt card, read from GET /api/proposals/{proposalId}/receipt (read only, this session only). The code is
// the one the return page showed and the merchant's sales feed shows. The dialog (Radix, shadcn/ui) has a title,
// closes on Escape and on its close button, traps focus while open and returns it to the control when closed.
import { useState } from 'react';
import { CheckCircle2, Ticket } from 'lucide-react';
import type { Receipt } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { api } from '@/hooks/useApi';
import { ReceiptCard } from './ReceiptCard';

export function BoughtReceipt({ proposalId, offerTitle }: { proposalId: string; offerTitle: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      setReceipt(await api.get<Receipt>(`/api/proposals/${encodeURIComponent(proposalId)}/receipt`));
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-panel bg-tint px-3.5 py-1.5" data-testid="pick-bought">
      <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-primary" data-testid="pick-status">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
        Bought
      </p>
      <Dialog onOpenChange={(open) => open && !receipt && void load()}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary" className="min-h-touch" aria-label={`Show redemption code for ${offerTitle}`}>
            <Ticket aria-hidden="true" />
            Show redemption code
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your redemption code</DialogTitle>
            <DialogDescription>Show this code at the counter.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <ReceiptCard receipt={receipt} />
          ) : failed ? (
            <ErrorState title="The receipt did not load" message="Nearby could not load this receipt just now. Try again in a moment." onRetry={() => void load()} />
          ) : (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the receipt">
              <Skeleton className="h-10 w-40 rounded-tile bg-tint" />
              <Skeleton className="h-20 rounded-panel bg-tint" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
