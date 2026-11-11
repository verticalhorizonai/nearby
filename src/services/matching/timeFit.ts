// Time fit by offer category, read from the appointment's start time in Phoenix time (spec 3.5.2). REQ-02-07.
// Poor means dropped for coffee, lunch, dinner and (build ruling 6, RATIFIED) juice or snack; service is never dropped.
import type { OfferCategory } from '../../shared/types.js';

export const TIME_FIT_GOOD = 1.0;
export const TIME_FIT_OK = 0.6;
export const TIME_FIT_POOR = 0;
export const TIME_FIT_SERVICE = 0.3;

const H = (h: number, m = 0) => h * 60 + m;
const within = (t: number, from: number, to: number) => t >= from && t <= to; // both ends inclusive, minute resolution

/** The fit of an offer category at a start time given as minutes since Phoenix midnight. */
export function timeFit(category: OfferCategory, startMinutes: number): number {
  const t = startMinutes;
  switch (category) {
    case 'coffee':
      if (within(t, H(6), H(10, 59))) return TIME_FIT_GOOD;
      if (within(t, H(11), H(13, 59))) return TIME_FIT_OK;
      return TIME_FIT_POOR;
    case 'lunch':
      if (within(t, H(11), H(13, 59))) return TIME_FIT_GOOD;
      if (within(t, H(10), H(10, 59)) || within(t, H(14), H(14, 59))) return TIME_FIT_OK;
      return TIME_FIT_POOR;
    case 'dinner':
      if (within(t, H(17), H(21))) return TIME_FIT_GOOD;
      if (within(t, H(15), H(16, 59))) return TIME_FIT_OK;
      return TIME_FIT_POOR;
    case 'juice_or_snack':
      if (within(t, H(10), H(17, 59))) return TIME_FIT_OK;
      return TIME_FIT_POOR;
    case 'service':
      return TIME_FIT_SERVICE;
  }
}

/** True when the category is dropped at a Poor fit (3.5.1 rule 4 with build ruling 6). */
export function isDroppedWhenPoor(category: OfferCategory): boolean {
  return category !== 'service';
}
