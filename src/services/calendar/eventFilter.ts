// Event filtering rules (spec 3.2.3; REQ-01-05), applied in code before the model sees anything. Descriptions and
// attendees are never stored (the tool does not even return them).
import type { GeoPoint, SkippedEventReason } from '../../shared/types.js';
import { haversineMeters } from '../matching/geo.js';

export const DOWNTOWN_TUCSON: GeoPoint = { lat: 32.2226, lng: -110.9747 };
export const MAX_DISTANCE_FROM_DOWNTOWN_M = 48_280;
const VIDEO_HOSTS = ['zoom.us', 'meet.google.com', 'teams.microsoft.com', 'webex'];
const VIDEO_WORDS = /\b(virtual|online|call)\b/i; // whole words (build ruling 15(a))

export function isVideoLocation(locationText: string): boolean {
  const lower = locationText.toLowerCase();
  return VIDEO_HOSTS.some((h) => lower.includes(h)) || VIDEO_WORDS.test(locationText);
}

/** The skip reason for an event, or null when it is a usable appointment. */
export function skipReason(
  event: { all_day: boolean; location_text: string | null },
  coordinates: GeoPoint | null,
): SkippedEventReason | null {
  if (event.all_day) return 'all_day';
  const loc = event.location_text?.trim() ?? '';
  if (loc === '') return 'no_address';
  if (isVideoLocation(loc)) return 'video_call';
  if (!coordinates) return 'no_coordinates';
  if (haversineMeters(coordinates, DOWNTOWN_TUCSON) > MAX_DISTANCE_FROM_DOWNTOWN_M) return 'out_of_area';
  return null;
}
