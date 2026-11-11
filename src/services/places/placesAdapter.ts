// Places adapter (tasks 20, 22; REQ-02-04, REQ-02-05; spec 3.4): Google Places Nearby Search (New) from the server, for
// the map's context only. Offers never come from Google, and picks never depend on it.
import type { Transport } from '../adapters/transport.js';
import type { PlaceSummary } from '../../shared/types.js';

export const PLACES_SEARCH_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
/** The five fields of spec 3.4.1 (Pro tier); opening hours are left out. */
export const PLACES_FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress,places.primaryType';
export const PLACES_MAX_RESULTS = 10;

export class PlacesUnavailableError extends Error {}

export interface PlacesRequest {
  lat: number;
  lng: number;
  radiusMeters: number;
  includedTypes: string[];
}

export interface PlacesAdapter {
  readonly configured: boolean;
  searchNearby(req: PlacesRequest): Promise<PlaceSummary[]>;
}

/** Fails fast when a request lacks the field mask: Google answers an error without it (task 20). */
export function assertFieldMask(headers: Record<string, string>): void {
  if (!headers['X-Goog-FieldMask']) throw new Error('Places request without X-Goog-FieldMask');
}

/** includedTypes by the appointment's start (3.4.2; build ruling 15(f)), Phoenix minutes since midnight. */
export function includedTypesFor(startMinutes: number): string[] {
  if (startMinutes < 11 * 60) return ['cafe', 'coffee_shop', 'bakery'];
  if (startMinutes <= 14 * 60) return ['restaurant'];
  if (startMinutes >= 17 * 60) return ['restaurant'];
  return [];
}

export class GooglePlacesAdapter implements PlacesAdapter {
  constructor(private readonly transport: Transport, private readonly apiKey: string | null) {}

  get configured(): boolean {
    return !!this.apiKey;
  }

  async searchNearby(req: PlacesRequest): Promise<PlaceSummary[]> {
    if (!this.apiKey) throw new PlacesUnavailableError('GOOGLE_MAPS_SERVER_KEY is not set');
    const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': PLACES_FIELD_MASK };
    assertFieldMask(headers);
    const body: Record<string, unknown> = {
      maxResultCount: PLACES_MAX_RESULTS,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: req.lat, longitude: req.lng }, radius: req.radiusMeters } },
    };
    if (req.includedTypes.length > 0) body.includedTypes = req.includedTypes;
    const res = await this.transport({ method: 'POST', url: PLACES_SEARCH_NEARBY_URL, headers, body: JSON.stringify(body), timeoutMs: 8000 });
    if (res.status !== 200) throw new PlacesUnavailableError(`Places answered HTTP ${res.status}`);
    const json = JSON.parse(res.body) as { places?: { id: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number } }[] };
    return (json.places ?? [])
      .filter((p) => p.location)
      .slice(0, PLACES_MAX_RESULTS)
      .map((p) => ({ placeId: p.id, name: p.displayName?.text ?? '', location: { lat: p.location!.latitude, lng: p.location!.longitude } }));
  }
}
