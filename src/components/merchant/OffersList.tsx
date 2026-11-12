// The merchant's offers, newest first (F4.1, F4.2 step 4; REQ-04-01, REQ-04-02): title, category, valid window, price
// with the regular price struck through, and a deposit note. Offers are live from the moment they are published.
// Build ruling 44: each offer opens a read-only view (the existing dialog) with every field and whether it is a
// sample offer or one you posted. An offer this browser posted also has Edit (the offer form, filled in) and Remove
// (with a confirmation); a sample offer has neither.
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MerchantOffer, RemoveOfferResult } from "@/shared/types";
import {
  CATEGORY_LABEL,
  formatCents,
  formatValidDays,
  formatValidWindow,
} from "@/client/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/components/ui/cn";
import { api, isApiError } from "@/hooks/useApi";

/** "7:00 to 11:00 AM": the hours of the valid window alone. */
function hours(o: MerchantOffer): string {
  return formatValidWindow(o).slice(formatValidDays(o.validDays).length + 2);
}

/** The read-only view of one offer: every field, in the existing dialog. */
function OfferView({ offer }: { offer: MerchantOffer }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="offer-view-open"
          aria-label={`View ${offer.title}`}
          className="-mx-1.5 -my-1 flex min-h-touch min-w-0 flex-col items-start rounded-tile px-1.5 py-1 text-left outline-none transition-colors duration-150 hover:bg-tint focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="font-semibold">{offer.title}</span>
          <span className="text-[13px] text-secondary-text">
            {CATEGORY_LABEL[offer.category]} · {formatValidWindow(offer)}
          </span>
          {offer.isDeposit && (
            <span className="text-[13px] font-semibold text-primary">
              Deposit, redeemed in store
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {offer.title}
            {offer.postedByYou ? (
              <Badge>Posted by you</Badge>
            ) : (
              <Badge variant="sample">Sample</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {offer.postedByYou
              ? "An offer you posted from this browser."
              : "A sample offer that every visitor sees."}
          </DialogDescription>
        </DialogHeader>
        <dl
          className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]"
          data-testid="offer-view"
        >
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
          <dd className="m-0">
            {offer.isDeposit ? "Yes, redeemed in store" : "No"}
          </dd>
          <dt className="text-secondary-text">Days</dt>
          <dd className="m-0">{formatValidDays(offer.validDays)}</dd>
          <dt className="text-secondary-text">Hours</dt>
          <dd className="m-0">{hours(offer)}</dd>
          <dt className="text-secondary-text">Offer</dt>
          <dd className="m-0">
            {offer.postedByYou ? "Posted by you" : "Sample offer"}
          </dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function RemoveOffer({
  offer,
  merchantId,
  onRemoved,
}: {
  offer: MerchantOffer;
  merchantId: string;
  onRemoved: (offerId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await api.post<RemoveOfferResult>(
        `/api/merchants/${encodeURIComponent(merchantId)}/offers/${encodeURIComponent(offer.id)}/remove`,
        {},
      );
      onRemoved(offer.id);
      toast.success(`Offer removed: ${offer.title}.`);
    } catch (e) {
      toast.error(
        isApiError(e) && e.status === 404
          ? "This offer is already gone."
          : "The offer was not removed. Try again in a moment.",
      );
      if (isApiError(e) && e.status === 404) onRemoved(offer.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          aria-label={`Remove ${offer.title}`}
          data-testid="offer-remove"
        >
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this offer?</AlertDialogTitle>
          <AlertDialogDescription>
            Shoppers stop seeing {offer.title} and its open picks are withdrawn.
            Its past sales and receipts stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void remove()}
            data-testid="offer-remove-confirm"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface OffersListProps {
  offers: MerchantOffer[];
  freshId: string | null;
  merchantId?: string;
  /** Opens the offer form on this offer (build ruling 44). */
  onEdit?: (offer: MerchantOffer) => void;
  onRemoved?: (offerId: string) => void;
}

export function OffersList({
  offers,
  freshId,
  merchantId = "",
  onEdit,
  onRemoved,
}: OffersListProps) {
  if (offers.length === 0) {
    return (
      <p className="rounded-panel bg-background px-4 py-5 text-body-text">
        No offers yet. Post one and shoppers nearby see it at once.
      </p>
    );
  }
  return (
    <ul
      className="m-0 flex list-none flex-col gap-2.5 p-0"
      aria-label="Offers, newest first"
    >
      {offers.map((o) => (
        <li
          key={o.id}
          data-testid="offer-row"
          className={cn(
            "flex flex-col gap-2 rounded-panel border px-4 py-3",
            o.id === freshId
              ? "border-primary bg-tint animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
              : "border-border bg-background",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <OfferView offer={o} />
            </div>
            <div className="flex-none text-right">
              <p className="font-display text-xl font-bold">
                {formatCents(o.priceCents)}
              </p>
              {o.regularPriceCents !== null && (
                <p className="text-[13px] text-secondary-text">
                  <span className="sr-only">Regular price </span>
                  <s>{formatCents(o.regularPriceCents)}</s>
                </p>
              )}
            </div>
          </div>
          {o.postedByYou && (
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              data-testid="offer-owner-actions"
            >
              <span className="text-[13px] font-semibold text-secondary-text">
                Posted by you
              </span>
              <div className="flex gap-2">
                {onEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onEdit(o)}
                    aria-label={`Edit ${o.title}`}
                    data-testid="offer-edit"
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                )}
                {onRemoved && (
                  <RemoveOffer
                    offer={o}
                    merchantId={merchantId}
                    onRemoved={onRemoved}
                  />
                )}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
