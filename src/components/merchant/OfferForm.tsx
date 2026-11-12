// The New offer form (F4.2; REQ-04-02, REQ-04-03, REQ-08-05, REQ-08-08; spec 3.8 and ruling 4): title (1 to 60
// characters, counted live), price and optional regular price in dollars, category, valid days, start and end
// time. The shared validator (src/validators/offerForm.ts) runs here beside each field and again on the server; a
// form that breaks a rule is refused with a message beside the field and nothing is sent. Dollars become integer
// cents with parseDollarsToCents: at most two decimals, never rounded.
// Edit (build ruling 44): the same form, filled in with an offer this session posted, under the same validation. Saving
// posts to the edit route, which removes the old offer and creates a new one with these fields.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { CreateOfferRequest, DayOfWeek, EditOfferResult, FieldError, MerchantOffer, OfferCategory, OfferFormField } from '@/shared/types';
import { OFFER_CATEGORIES, OFFER_TITLE_MAX_LENGTH } from '@/shared/types';
import { DAYS_OF_WEEK, OFFER_FORM_MESSAGES, parseDollarsToCents, titleLength, validateCreateOffer } from '@/validators/offerForm';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/components/ui/cn';
import { api, isApiError } from '@/hooks/useApi';
import { CATEGORY_LABEL } from '@/client/format';

const DAY_LABEL: Record<DayOfWeek, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const FIELD_ORDER: OfferFormField[] = ['title', 'priceCents', 'regularPriceCents', 'category', 'validDays', 'validStartTime', 'validEndTime'];
const FIELD_ID: Record<OfferFormField, string> = {
  title: 'offer-title',
  priceCents: 'offer-price',
  regularPriceCents: 'offer-regular-price',
  category: 'offer-category',
  validDays: 'offer-day-mon',
  validStartTime: 'offer-start',
  validEndTime: 'offer-end',
};

interface Values {
  title: string;
  price: string;
  regularPrice: string;
  category: OfferCategory | '';
  days: DayOfWeek[];
  start: string;
  end: string;
}

const EMPTY: Values = { title: '', price: '', regularPrice: '', category: '', days: [], start: '', end: '' };

/** Integer cents to the dollars the field shows ("6.00"). */
function centsToDollars(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** The form's values for an offer being edited. */
export function valuesFor(o: MerchantOffer): Values {
  return {
    title: o.title,
    price: centsToDollars(o.priceCents),
    regularPrice: o.regularPriceCents === null ? '' : centsToDollars(o.regularPriceCents),
    category: o.category,
    days: [...o.validDays],
    start: o.validStartTime,
    end: o.validEndTime,
  };
}

/** The request the form would send: dollars to integer cents (ruling 4). An unreadable amount stays unreadable, so the
 * validator refuses it beside its field instead of anything being rounded. */
function toCreateOfferRequest(v: Values): Record<string, unknown> {
  const regular = v.regularPrice.trim();
  return {
    title: v.title,
    priceCents: parseDollarsToCents(v.price),
    regularPriceCents: regular === '' ? null : (parseDollarsToCents(regular) ?? Number.NaN),
    category: v.category,
    validDays: v.days,
    validStartTime: v.start,
    validEndTime: v.end,
  };
}

function errorMap(list: FieldError[]): Partial<Record<OfferFormField, string>> {
  const out: Partial<Record<OfferFormField, string>> = {};
  for (const e of list) if (!out[e.field]) out[e.field] = e.message;
  return out;
}

function FieldMessage({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-error" data-testid={`error-${id}`}>
      {message}
    </p>
  );
}

interface OfferFormProps {
  merchantId: string;
  /** The new offer; for an edit, also the id of the offer it replaces. */
  onPublished: (offer: MerchantOffer, replacedOfferId?: string) => void;
  onCancel: () => void;
  /** An offer this session posted: the form edits it (build ruling 44). */
  editing?: MerchantOffer;
}

export function OfferForm({ merchantId, onPublished, onCancel, editing }: OfferFormProps) {
  const [values, setValues] = useState<Values>(() => (editing ? valuesFor(editing) : EMPTY));
  const [touched, setTouched] = useState<Set<OfferFormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<OfferFormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const check = useMemo(() => validateCreateOffer(toCreateOfferRequest(values)), [values]);
  const localErrors = check.ok ? {} : errorMap(check.fieldErrors);

  const shown = (f: OfferFormField): string | undefined => serverErrors[f] ?? ((submitted || touched.has(f)) ? localErrors[f] : undefined);

  const set = <K extends keyof Values>(key: K, field: OfferFormField, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setServerErrors((e) => {
      if (!e[field] && !(field === 'validStartTime' && e.validEndTime)) return e;
      const n = { ...e };
      delete n[field];
      if (field === 'validStartTime') delete n.validEndTime;
      return n;
    });
  };
  const touch = (f: OfferFormField) => setTouched((t) => (t.has(f) ? t : new Set(t).add(f)));

  const focusFirstError = (errs: Partial<Record<OfferFormField, string>>) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${FIELD_ID[first]}`)?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!check.ok) {
      focusFirstError(localErrors);
      return; // Refused beside the fields; nothing is sent.
    }
    const body: CreateOfferRequest = check.value;
    setSending(true);
    try {
      const base = `/api/merchants/${encodeURIComponent(merchantId)}/offers`;
      if (editing) {
        const r = await api.post<EditOfferResult>(`${base}/${encodeURIComponent(editing.id)}/edit`, body);
        onPublished(r.offer, r.replacedOfferId);
      } else {
        onPublished(await api.post<MerchantOffer>(base, body));
      }
    } catch (err) {
      if (isApiError(err) && err.fieldErrors.length > 0) {
        const map = errorMap(err.fieldErrors);
        setServerErrors(map);
        focusFirstError(map);
      } else if (isApiError(err) && err.status === 429) {
        setFormError(`${err.message} Nothing was saved.`);
      } else {
        setFormError(editing ? 'The changes were not saved. Try again in a moment.' : 'The offer was not published. Nothing was saved. Try again in a moment.');
      }
    } finally {
      setSending(false);
    }
  };

  const titleCount = titleLength(values.title);
  const describe = (id: string, msg?: string, extra?: string) => [msg ? id : null, extra ?? null].filter(Boolean).join(' ') || undefined;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5" aria-labelledby="new-offer-heading" data-testid="offer-form">
      <h3 id="new-offer-heading" className="font-display text-2xl font-bold">
        {editing ? 'Edit offer' : 'New offer'}
      </h3>
      {editing && (
        <p className="-mt-3 text-[13px] text-secondary-text">
          Saving replaces the offer: open picks for it are withdrawn, and past sales and receipts keep the old title and price.
        </p>
      )}

      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="offer-title">Title</Label>
          <span id="offer-title-count" className={cn('text-[13px]', titleCount > OFFER_TITLE_MAX_LENGTH ? 'text-error' : 'text-secondary-text')} aria-live="polite">
            {titleCount}/{OFFER_TITLE_MAX_LENGTH}
          </span>
        </div>
        <Input
          id="offer-title"
          value={values.title}
          onChange={(e) => set('title', 'title', e.target.value)}
          onBlur={() => touch('title')}
          aria-invalid={!!shown('title')}
          aria-describedby={describe('offer-title-error', shown('title'), 'offer-title-count')}
          placeholder="Any drink plus pastry"
          autoComplete="off"
        />
        <FieldMessage id="offer-title-error" message={shown('title')} />
      </div>

      {/* Price and regular price */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-price">Price in dollars</Label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text">
              $
            </span>
            <Input
              id="offer-price"
              inputMode="decimal"
              className="pl-7"
              value={values.price}
              onChange={(e) => set('price', 'priceCents', e.target.value)}
              onBlur={() => touch('priceCents')}
              aria-invalid={!!shown('priceCents')}
              aria-describedby={describe('offer-price-error', shown('priceCents'))}
              placeholder="6.00"
            />
          </div>
          <FieldMessage id="offer-price-error" message={shown('priceCents')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-regular-price">
            Regular price in dollars <span className="font-normal text-secondary-text">(optional)</span>
          </Label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text">
              $
            </span>
            <Input
              id="offer-regular-price"
              inputMode="decimal"
              className="pl-7"
              value={values.regularPrice}
              onChange={(e) => set('regularPrice', 'regularPriceCents', e.target.value)}
              onBlur={() => touch('regularPriceCents')}
              aria-invalid={!!shown('regularPriceCents')}
              aria-describedby={describe('offer-regular-price-error', shown('regularPriceCents'))}
            />
          </div>
          <FieldMessage id="offer-regular-price-error" message={shown('regularPriceCents')} />
        </div>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-category">Category</Label>
        <Select
          value={values.category || undefined}
          onValueChange={(v) => {
            set('category', 'category', v as OfferCategory);
            touch('category');
          }}
          name="category"
        >
          <SelectTrigger
            id="offer-category"
            aria-invalid={!!shown('category')}
            aria-describedby={describe('offer-category-error', shown('category'))}
          >
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {OFFER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldMessage id="offer-category-error" message={shown('category')} />
      </div>

      {/* Valid days */}
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0" aria-describedby={describe('offer-days-error', shown('validDays'))}>
        <legend className="mb-1.5 text-sm font-semibold">Valid days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((d) => {
            const checked = values.days.includes(d);
            return (
              <label
                key={d}
                htmlFor={`offer-day-${d}`}
                className={cn(
                  'flex min-h-touch cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150',
                  checked ? 'border-primary bg-tint text-primary' : 'border-outline-border bg-card text-foreground hover:bg-tint',
                )}
              >
                <Checkbox
                  id={`offer-day-${d}`}
                  checked={checked}
                  aria-invalid={!!shown('validDays')}
                  onCheckedChange={(c) => {
                    set(
                      'days',
                      'validDays',
                      c === true ? DAYS_OF_WEEK.filter((x) => x === d || values.days.includes(x)) : values.days.filter((x) => x !== d),
                    );
                    touch('validDays');
                  }}
                />
                {DAY_LABEL[d]}
              </label>
            );
          })}
        </div>
        <FieldMessage id="offer-days-error" message={shown('validDays')} />
      </fieldset>

      {/* Valid hours */}
      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-start">Start time</Label>
          <Input
            id="offer-start"
            type="time"
            step={60}
            value={values.start}
            onChange={(e) => set('start', 'validStartTime', e.target.value)}
            onBlur={() => touch('validStartTime')}
            aria-invalid={!!shown('validStartTime')}
            aria-describedby={describe('offer-start-error', shown('validStartTime'))}
          />
          <FieldMessage id="offer-start-error" message={shown('validStartTime')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-end">End time</Label>
          <Input
            id="offer-end"
            type="time"
            step={60}
            value={values.end}
            onChange={(e) => set('end', 'validEndTime', e.target.value)}
            onBlur={() => touch('validEndTime')}
            aria-invalid={!!shown('validEndTime')}
            aria-describedby={describe('offer-end-error', shown('validEndTime'))}
          />
          <FieldMessage id="offer-end-error" message={shown('validEndTime')} />
        </div>
      </div>
      <p className="-mt-3 text-[13px] text-secondary-text">Times are in Tucson time. {OFFER_FORM_MESSAGES.order}</p>

      {formError && (
        <p role="alert" className="text-sm text-error">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" size="lg" disabled={sending}>
          {editing ? (sending ? 'Saving…' : 'Save changes') : sending ? 'Publishing…' : 'Publish'}
        </Button>
        <Button type="button" size="lg" variant="secondary" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
