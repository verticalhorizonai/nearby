// Offer form validation (task 206; REQ-04-03, REQ-08-08; spec 3.8 with ruling 4). One validator for both sides: the
// form runs it beside each field, and POST /api/merchants/{id}/offers runs it again before anything is saved.
// A form that breaks a rule is refused with a message beside the field, and nothing is saved.
import type { CreateOfferRequest, DayOfWeek, FieldError, OfferCategory } from '../shared/types.js';
import { OFFER_CATEGORIES, OFFER_PRICE_MAX_CENTS, OFFER_PRICE_MIN_CENTS, OFFER_TITLE_MAX_LENGTH, OFFER_TITLE_MIN_LENGTH } from '../shared/types.js';

export const DAYS_OF_WEEK: readonly DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const OFFER_FORM_MESSAGES = {
  title: `Enter a title of ${OFFER_TITLE_MIN_LENGTH} to ${OFFER_TITLE_MAX_LENGTH} characters.`,
  price: 'Enter a price from $0.50 to $500.00, with at most two decimals.',
  regularPrice: 'Enter a regular price higher than the price, with at most two decimals, or leave it empty.',
  category: 'Choose a category.',
  days: 'Choose at least one day.',
  time: 'Enter a time as HH:MM.',
  order: 'The start time must be earlier than the end time, on the same day.',
} as const;

/** Dollars typed in the form to integer cents (ruling 4): at most two decimals, never rounded. Null when not a price. */
export function parseDollarsToCents(input: string): number | null {
  const m = /^(\d{0,6})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const whole = m[1] === '' ? 0 : Number(m[1]);
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  return whole * 100 + frac;
}

/** The number of characters a person sees (code points), after trimming. */
export function titleLength(title: string): number {
  return [...title.trim()].length;
}

/** Validates a create-offer request in integer cents. Returns the normalised request or the field errors. */
export function validateCreateOffer(input: unknown): { ok: true; value: CreateOfferRequest } | { ok: false; fieldErrors: FieldError[] } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (titleLength(title) < OFFER_TITLE_MIN_LENGTH || titleLength(title) > OFFER_TITLE_MAX_LENGTH) errors.push({ field: 'title', message: OFFER_FORM_MESSAGES.title });

  const price = b.priceCents;
  const priceOk = typeof price === 'number' && Number.isSafeInteger(price) && price >= OFFER_PRICE_MIN_CENTS && price <= OFFER_PRICE_MAX_CENTS;
  if (!priceOk) errors.push({ field: 'priceCents', message: OFFER_FORM_MESSAGES.price });

  const regular = b.regularPriceCents ?? null;
  if (regular !== null) {
    const regularOk = typeof regular === 'number' && Number.isSafeInteger(regular) && (!priceOk || regular > (price as number));
    if (!regularOk) errors.push({ field: 'regularPriceCents', message: OFFER_FORM_MESSAGES.regularPrice });
  }

  const category = b.category;
  if (typeof category !== 'string' || !(OFFER_CATEGORIES as readonly string[]).includes(category)) errors.push({ field: 'category', message: OFFER_FORM_MESSAGES.category });

  const daysIn = Array.isArray(b.validDays) ? b.validDays : [];
  const days = DAYS_OF_WEEK.filter((d) => daysIn.includes(d));
  if (days.length === 0 || daysIn.some((d) => !(DAYS_OF_WEEK as readonly unknown[]).includes(d))) errors.push({ field: 'validDays', message: OFFER_FORM_MESSAGES.days });

  const start = typeof b.validStartTime === 'string' ? b.validStartTime : '';
  const end = typeof b.validEndTime === 'string' ? b.validEndTime : '';
  if (!HHMM.test(start)) errors.push({ field: 'validStartTime', message: OFFER_FORM_MESSAGES.time });
  if (!HHMM.test(end)) errors.push({ field: 'validEndTime', message: OFFER_FORM_MESSAGES.time });
  else if (HHMM.test(start) && start >= end) errors.push({ field: 'validEndTime', message: OFFER_FORM_MESSAGES.order });

  if (errors.length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      title,
      priceCents: price as number,
      regularPriceCents: regular as number | null,
      category: category as OfferCategory,
      validDays: days,
      validStartTime: start,
      validEndTime: end,
    },
  };
}
