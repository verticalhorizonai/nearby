// Display formatting for the client. Money is integer cents formatted with integer arithmetic only (spec 3.7.4;
// REQ-03-09). Times are shown in America/Phoenix, the demo's time zone (spec 3.5, 3.10.2).
import type { DayOfWeek, OfferCategory, SkippedEventReason, ValidWindow } from '@/shared/types';

export const APP_TIME_ZONE = 'America/Phoenix';

/** Integer cents to "$6.00". No floating point touches the amount (spec 3.7.4). */
export function formatCents(cents: number): string {
  const c = Math.trunc(cents);
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const METERS_PER_MILE = 1609.344;

/** Distance in miles to one decimal, e.g. "0.2 mi" (design/appointment-detail.html). */
export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.05) return 'Under 0.1 mi';
  return `${miles.toFixed(1)} mi`;
}

/** The search radius chip: "1 mile" or "3 miles" (spec 3.11.2 The map; REQ-02-05). */
export function formatRadius(meters: number): string {
  const miles = Math.max(1, Math.round(meters / METERS_PER_MILE));
  return miles === 1 ? '1 mile' : `${miles} miles`;
}

// ---------------------------------------------------------------------------------------------------------------
// Clock times
// ---------------------------------------------------------------------------------------------------------------

interface Clock {
  hour12: number;
  minute: number;
  pm: boolean;
}

function clockFromHHMM(hhmm: string): Clock {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  const hour = Number.isFinite(h) ? h % 24 : 0;
  return { hour12: hour % 12 === 0 ? 12 : hour % 12, minute: Number.isFinite(m) ? m : 0, pm: hour >= 12 };
}

function clockText(c: Clock): string {
  return `${c.hour12}:${String(c.minute).padStart(2, '0')}`;
}

/** "7:00 to 11:00 AM" when both ends share AM or PM, else "8:00 AM to 6:00 PM". */
function clockRange(a: Clock, b: Clock): string {
  const ap = (c: Clock) => (c.pm ? 'PM' : 'AM');
  if (a.pm === b.pm) return `${clockText(a)} to ${clockText(b)} ${ap(b)}`;
  return `${clockText(a)} ${ap(a)} to ${clockText(b)} ${ap(b)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Valid window
// ---------------------------------------------------------------------------------------------------------------

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT: Record<DayOfWeek, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** "Weekdays", "Daily", "Weekends", "Tue to Sat" or "Mon, Wed, Fri". */
export function formatValidDays(days: DayOfWeek[]): string {
  const set = new Set(days);
  const idx = DAY_ORDER.map((d, i) => (set.has(d) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return 'No days';
  if (idx.length === 7) return 'Daily';
  if (idx.length === 5 && idx.every((i) => i <= 4)) return 'Weekdays';
  if (idx.length === 2 && set.has('sat') && set.has('sun')) return 'Weekends';
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length >= 3) return `${DAY_SHORT[DAY_ORDER[idx[0]]]} to ${DAY_SHORT[DAY_ORDER[idx[idx.length - 1]]]}`;
  return idx.map((i) => DAY_SHORT[DAY_ORDER[i]]).join(', ');
}

/** "Weekdays, 7:00 to 11:00 AM" (spec 3.11.2 The pick card). */
export function formatValidWindow(w: ValidWindow): string {
  return `${formatValidDays(w.validDays)}, ${clockRange(clockFromHHMM(w.validStartTime), clockFromHHMM(w.validEndTime))}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Appointment times, in America/Phoenix
// ---------------------------------------------------------------------------------------------------------------

interface ZonedParts extends Clock {
  weekday: string;
  weekdayShort: string;
  month: string;
  day: string;
}

const zonedFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function zoned(iso: string): ZonedParts {
  const parts = zonedFormat.formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number.parseInt(get('hour'), 10);
  return {
    weekday,
    weekdayShort: weekday.slice(0, 3),
    month: get('month'),
    day: get('day'),
    hour12: Number.isFinite(hour) ? hour : 12,
    minute: Number.parseInt(get('minute'), 10) || 0,
    pm: get('dayPeriod').toUpperCase() === 'PM',
  };
}

/** "9:30" — the map label "Your 9:30" (spec 3.11.2 The map). */
export function formatShortTime(iso: string): string {
  return clockText(zoned(iso));
}

/** "9:30 AM". */
export function formatTime(iso: string): string {
  const z = zoned(iso);
  return `${clockText(z)} ${z.pm ? 'PM' : 'AM'}`;
}

/** "9:30 to 10:30 AM". */
export function formatTimeRange(startIso: string, endIso: string): string {
  return clockRange(zoned(startIso), zoned(endIso));
}

/** "Tuesday, 9:30 to 10:30 AM" (design/appointment-detail.html header). */
export function formatDayTimeRange(startIso: string, endIso: string): string {
  return `${zoned(startIso).weekday}, ${formatTimeRange(startIso, endIso)}`;
}

/** "Tuesday, Nov 17" — a day heading on My week. */
export function formatDayHeading(iso: string): string {
  const z = zoned(iso);
  return `${z.weekday}, ${z.month} ${z.day}`;
}

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** A stable key for grouping by calendar day in America/Phoenix. */
export function dayKey(iso: string): string {
  return dayKeyFormat.format(new Date(iso));
}

/** "Wed 3:00 PM". */
export function formatDayShortTime(iso: string): string {
  const z = zoned(iso);
  return `${z.weekdayShort} ${clockText(z)} ${z.pm ? 'PM' : 'AM'}`;
}

/** Short reasons for skipped events (F1.2 step 2; REQ-01-02; build ruling 9). */
export const SKIP_REASON_TEXT: Record<SkippedEventReason, string> = {
  no_address: 'No address',
  video_call: 'Video call',
  all_day: 'All day',
  no_coordinates: 'Address not found on the map',
  out_of_area: 'Outside the Tucson area',
};

/** When a skipped event happens: "Wed 3:00 PM", or just "Wed" for an all-day event (a date-only value is a calendar
 * date, not an instant, so it is read without a time zone shift). */
export function formatEventWhen(startsAt: string, allDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${startsAt}T00:00:00Z`));
  }
  return allDay ? zoned(startsAt).weekdayShort : formatDayShortTime(startsAt);
}

/** Offer category labels for the offer form and the offers list (spec 3.8). */
export const CATEGORY_LABEL: Record<OfferCategory, string> = {
  coffee: 'Coffee',
  lunch: 'Lunch',
  dinner: 'Dinner',
  juice_or_snack: 'Juice or snack',
  service: 'Service',
};
