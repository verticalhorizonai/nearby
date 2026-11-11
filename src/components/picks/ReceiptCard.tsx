// The receipt (F3.1 step 5; REQ-03-01, REQ-03-11, REQ-08-04; spec 3.11 Receipt): "Paid", the amount, the redemption
// code in the system monospaced font at 28 px with letter spacing, the merchant (Sample), the item, and the
// "redeem in store" note for a deposit.
import { Check } from 'lucide-react';
import type { Receipt } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCents } from '@/client/format';

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <Card className="flex flex-col gap-5 rounded-section p-6 shadow-pick" data-testid="receipt">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-bold">Paid</h1>
        </div>
        <p className="font-display text-price font-bold" data-testid="receipt-amount">
          {formatCents(receipt.amountCents)}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5 rounded-panel bg-background px-4 py-5">
        <p className="text-label uppercase text-secondary-text">Redemption code</p>
        <p className="m-0 font-mono text-code font-semibold text-foreground" data-testid="redemption-code">
          {receipt.redemptionCode}
        </p>
      </div>

      <dl className="m-0 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-[13px] text-secondary-text">Merchant</dt>
          <dd className="m-0 flex items-center gap-2 font-semibold">
            {receipt.merchantName}
            {receipt.merchantIsSample && <Badge variant="sample">Sample</Badge>}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-[13px] text-secondary-text">Item</dt>
          <dd className="m-0 text-body-text">{receipt.offerTitle}</dd>
        </div>
      </dl>

      {receipt.isDeposit && (
        <p className="rounded-panel bg-tint px-4 py-3 text-[15px] font-semibold text-primary" data-testid="deposit-note">
          Redeem in store.
        </p>
      )}
      <p className="text-[13px] text-secondary-text">Show the code at the counter. This was a PayPal sandbox payment; no real money moved.</p>
    </Card>
  );
}
