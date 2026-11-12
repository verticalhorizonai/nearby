// The merchant's offers, newest first (F4.1, F4.2 step 4; REQ-04-01, REQ-04-02): title, category, valid window, price
// with the regular price struck through, and a deposit note. Offers are live from the moment they are published.
// Build ruling 44: each offer opens a read-only view (the existing dialog) with every field and whether it is a
// sample offer or one you posted; an offer this browser posted has Edit and Remove (with a confirmation).
// Build ruling 45: every row has a visible "View" button (the title still opens the view too). A sample offer has
// Edit as well: saving makes this browser's own version, which replaces the sample offer in this demo only. A sample
// offer still has no Remove. Under a version that replaces a sample offer, and in its view, one plain line says so.
import { useState } from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantOffer, RemoveOfferResult } from '@/shared/types';
import { SAMPLE_REPLACEMENT_LINE } from '@/shared/types';
import { CATEGORY_LABEL, formatCents, formatValidDays, formatValidWindow } from '@/client/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/components/ui/cn';
import { api, isApiError } from '@/hooks/useApi';

/** "7:00 to 11:00 AM": the hours of the valid window alone. */
function hours(o: MerchantOffer): string {
  return formatValidWindow(o).slice(formatValidDays(o.validDays).length + 2);
}

/** What kind of offer it is, in a few words, for the view. */
function kindOf(o: MerchantOffer): string {
  if (!o.postedByYou) return 'Sample offer';
  return o.replacesOfferId ? 'Your version of a sample offer' : 'Posted by you';
}

/** The row's buttons: icons from 640 px; on a phone the words alone, so View, Edit and Remove fit one line at 375 px. */
const action = 'px-3.5 max-sm:[&_svg]:hidden';

/** The read-only view of one offer, every field, in the existing dialog. The View button is its trigger. */
function OfferView({ offer, open, onOpenChange }: { offer: MerchantOffer; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className={action} aria-label={`View ${offer.title}`} data-testid="offer-view-button">
          <Eye aria-hidden="true" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {offer.title}
            {offer.postedByYou ? <Badge>Posted by you</Badge> : <Badge variant="sample">Sample</Badge>}
          </DialogTitle>
          <DialogDescription>
            {offer.replacesOfferId
              ? SAMPLE_REPLACEMENT_LINE
              : offer.postedByYou
                ? 'An offer you posted from this browser.'
                : 'A sample offer that every visitor sees.'}
          </DialogDescription>
        </DialogHeader>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]" data-testid="offer-view">
          <dt className="text-secondary-text">Title</dt>
          <dd className="m-0 break-words font-semibold">{offer.title}</dd>
          <dt className="text-secondary-text">Category</dt>
          <dd className="m-0">{CATEGORY_LABEL[offer.category]}</dd>
          <dt className="text-secondary-text">Price</dt>
          <dd className="m-0">{formatCents(offer.priceCents)}</dd>
          {offer.regularPriceCents !== null && (
            <>
              <dt className="text-secondary-text">Regular price</dt>
              <dd className="m-0">{formatCents(offer.regularPriceCents)}</dd>
            </>
          )}
          <dt className="text-secondary-text">Deposit</dt>
          <dd className="m-0">{offer.isDeposit ? 'Yes, redeemed in store' : 'No'}</dd>
          <dt className="text-secondary-text">Days</dt>
          <dd className="m-0">{formatValidDays(offer.validDays)}</dd>
          <dt className="text-secondary-text">Hours</dt>
          <dd className="m-0">{hours(offer)}</dd>
          <dt className="text-secondary-text">Offer</dt>
          <dd className="m-0">{kindOf(offer)}</dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function RemoveOffer({ offer, merchantId, onRemoved }: { offer: MerchantOffer; merchantId: string; onRemoved: (offer: MerchantOffer) => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await api.post<RemoveOfferResult>(`/api/merchants/${encodeURIComponent(merchantId)}/offers/${encodeURIComponent(offer.id)}/remove`, {});
      onRemoved(offer);
      toast.success(offer.replacesOfferId ? `Your version removed: the sample offer is back.` : `Offer removed: ${offer.title}.`);
    } catch (e) {
      toast.error(isApiError(e) && e.status === 404 ? 'This offer is already gone.' : 'The offer was not removed. Try again in a moment.');
      if (isApiError(e) && e.status === 404) onRemoved(offer);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className={action} disabled={busy} aria-label={`Remove ${offer.title}`} data-testid="offer-remove">
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this offer?</AlertDialogTitle>
          <AlertDialogDescription>
            {offer.replacesOfferId
              ? `Your version goes and the sample offer comes back in your demo. Open picks for ${offer.title} are withdrawn; past sales and receipts stay as they are.`
              : `Shoppers stop seeing ${offer.title} and its open picks are withdrawn. Its past sales and receipts stay as they are.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => void remove()} data-testid="offer-remove-confirm">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OfferRow({ offer: o, fresh, merchantId, onEdit, onRemoved }: { offer: MerchantOffer; fresh: boolean } & Omit<OffersListProps, 'offers' | 'freshId'>) {
  const [viewOpen, setViewOpen] = useState(false);
  return (
    <li
      data-testid="offer-row"
      className={cn(
        'flex flex-col gap-2 rounded-panel border px-4 py-3',
        fresh ? 'border-primary bg-tint animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* A tap on the title also opens the view; the View button below is the control, for keyboards and readers too. */}
        <div
          data-testid="offer-view-open"
          onClick={() => setViewOpen(true)}
          className="-mx-1.5 -my-1 flex min-w-0 cursor-pointer flex-col items-start rounded-tile px-1.5 py-1 text-left transition-colors duration-150 hover:bg-tint"
        >
          <span className="font-semibold">{o.title}</span>
          <span className="text-[13px] text-secondary-text">
            {CATEGORY_LABEL[o.category]} · {formatValidWindow(o)}
          </span>
          {o.isDeposit && <span className="text-[13px] font-semibold text-primary">Deposit, redeemed in store</span>}
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
      </div>
      {o.postedByYou && (
        <p className="text-[13px] font-semibold text-secondary-text" data-testid="offer-owner-line">
          {o.replacesOfferId ? SAMPLE_REPLACEMENT_LINE : 'Posted by you'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2" data-testid="offer-actions">
        <OfferView offer={o} open={viewOpen} onOpenChange={setViewOpen} />
        {onEdit && (
          <Button type="button" variant="secondary" size="sm" className={action} onClick={() => onEdit(o)} aria-label={`Edit ${o.title}`} data-testid="offer-edit">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        )}
        {o.postedByYou && onRemoved && <RemoveOffer offer={o} merchantId={merchantId ?? ''} onRemoved={onRemoved} />}
      </div>
    </li>
  );
}

interface OffersListProps {
  offers: MerchantOffer[];
  freshId: string | null;
  merchantId?: string;
  /** Opens the offer form on this offer: an offer you posted, or a sample offer to make your own version of (ruling 45). */
  onEdit?: (offer: MerchantOffer) => void;
  onRemoved?: (offer: MerchantOffer) => void;
}

export function OffersList({ offers, freshId, merchantId = '', onEdit, onRemoved }: OffersListProps) {
  if (offers.length === 0) {
    return <p className="rounded-panel bg-background px-4 py-5 text-body-text">No offers yet. Post one and shoppers nearby see it at once.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Offers, newest first">
      {offers.map((o) => (
        <OfferRow key={o.id} offer={o} fresh={o.id === freshId} merchantId={merchantId} onEdit={onEdit} onRemoved={onRemoved} />
      ))}
    </ul>
  );
}
