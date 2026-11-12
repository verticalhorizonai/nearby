// Text an outside assistant gives (build rulings 42 and 47): the stop's title and the place's name, carried in a
// checkout link. Data only: text with control and format characters removed and spaces collapsed, trimmed, cut to its
// limit. It is shown as text (React escapes it), never put in a pick's sentence and never sent to a model.
import { HANDOFF_PLACE_MAX_LENGTH, HANDOFF_TITLE_MAX_LENGTH } from '../../shared/types.js';

/** Plain, trimmed text of at most `max` characters, or null when nothing is left. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(text).slice(0, max).join('').trim();
  return cut === '' ? null : cut;
}

/** What the stop is ("Lunch with Sam"), at most HANDOFF_TITLE_MAX_LENGTH characters. */
export const cleanStopTitle = (raw: unknown) => cleanText(raw, HANDOFF_TITLE_MAX_LENGTH);

/** A short name for the place ("Fourth Avenue, Tucson"), at most HANDOFF_PLACE_MAX_LENGTH characters. */
export const cleanPlaceName = (raw: unknown) => cleanText(raw, HANDOFF_PLACE_MAX_LENGTH);

/** The place as coordinates: the address line when no place name is given, and all the model is ever told. */
export function coordinatesText(lat: number, lng: number): string {
  return `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
