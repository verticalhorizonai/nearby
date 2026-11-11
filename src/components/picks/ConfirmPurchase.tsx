// The confirm sheet (F3.1 step 2-3; REQ-03-01, REQ-08-05, REQ-08-09; spec 3.11 Confirm sheet): merchant with the
// "Sample merchant" label, item, price, valid window and "Pay with PayPal". A Sheet from the bottom on a phone, a
// Dialog from 900 px wide (spec 3.11.2 Foundation). Nothing is bought until the shopper approves on PayPal.
import type { ConfirmSheet } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { formatCents, formatValidWindow } from '@/client/format';

interface ConfirmPurchaseProps {
  sheet: ConfirmSheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPay: () => void;
  paying: boolean;
}

const TITLE = 'Confirm your pick';
const DESCRIPTION = 'You approve the payment on PayPal’s sandbox page. No real money moves.';

function Body({ sheet, onPay, paying }: { sheet: ConfirmSheet; onPay: () => void; paying: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="m-0 flex flex-col gap-3 rounded-panel bg-background p-4">
        <div className="flex flex-col gap-1">
          <dt className="sr-only">Merchant</dt>
          <dd className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-bold">
            {sheet.merchantName}
            {sheet.merchantIsSample && <Badge variant="sample">Sample merchant</Badge>}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <dt className="text-[13px] text-secondary-text">Item</dt>
            <dd className="m-0 text-[15px] text-body-text">{sheet.offerTitle}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[13px] text-secondary-text">Price</dt>
            <dd className="m-0 font-display text-price font-bold" data-testid="confirm-price">
              {formatCents(sheet.priceCents)}
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-[13px] text-secondary-text">Valid</dt>
          <dd className="m-0 text-[15px] text-body-text">{formatValidWindow(sheet.validWindow)}</dd>
        </div>
      </dl>
      <Button type="button" className="h-12 w-full text-base" onClick={onPay} disabled={paying}>
        {paying ? 'Opening PayPal…' : 'Pay with PayPal'}
      </Button>
    </div>
  );
}

export function ConfirmPurchase({ sheet, open, onOpenChange, onPay, paying }: ConfirmPurchaseProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (!sheet) return null;

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TITLE}</DialogTitle>
            <DialogDescription>{DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <Body sheet={sheet} onPay={onPay} paying={paying} />
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLE}</SheetTitle>
          <SheetDescription>{DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <Body sheet={sheet} onPay={onPay} paying={paying} />
      </SheetContent>
    </Sheet>
  );
}
