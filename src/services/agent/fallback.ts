// The fallback (task 39; REQ-03-06; spec 3.6.4): an appointment's picks are its top two candidates by score (3.5.3)
// and each reason comes from the fixed template "{merchant} is {distance} from your {start time} and the deal runs
// {valid window}." The shopper sees picks, not an error.
import { FALLBACK_REASON_TEMPLATE } from '../../shared/types.js';
import type { Candidate } from '../matching/matcher.js';
import { METERS_PER_MILE } from '../matching/geo.js';
import { formatTime, parseHhMm, phoenixClock } from '../time/phoenix.js';

export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return `${Math.max(0.1, Math.round(miles * 10) / 10).toFixed(1)} mi`;
}

/** "7:00 to 11:00 AM", "8:00 AM to 6:00 PM". */
export function formatValidWindow(start: string, end: string): string {
  const s = parseHhMm(start) ?? 0;
  const e = parseHhMm(end) ?? 0;
  const sameHalf = s < 720 === e < 720;
  return sameHalf ? `${formatTime(s, false)} to ${formatTime(e)}` : `${formatTime(s)} to ${formatTime(e)}`;
}

export function fallbackReason(c: Candidate, appointmentStart: Date): string {
  return FALLBACK_REASON_TEMPLATE.replace('{merchant}', c.offer.merchantName)
    .replace('{distance}', formatMiles(c.distanceMeters))
    .replace('{start time}', formatTime(phoenixClock(appointmentStart).minutes, false))
    .replace('{valid window}', formatValidWindow(c.offer.validStartTime, c.offer.validEndTime));
}

export interface ChosenPick {
  candidate: Candidate;
  reason: string;
}

/** The top two candidates by score with the template reason. `shown` is already the top two with score >= 0.35. */
export function fallbackPicks(shown: Candidate[], appointmentStart: Date): ChosenPick[] {
  return shown.map((candidate) => ({ candidate, reason: fallbackReason(candidate, appointmentStart) }));
}
