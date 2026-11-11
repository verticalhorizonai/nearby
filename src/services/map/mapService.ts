// Appointment map data (tasks 11, 12, 22; REQ-02-01, REQ-02-05; spec 3.4, 3.11.2): the appointment pin, the search
// radius (1 mile, or 3 when no candidate is within 1), real places from Google for context, and Nearby's merchants
// with offers highlighted. With no Google key, or when a Google call fails, the map is the SVG plot of the appointment
// and Nearby's own merchants, with no error message.
import type { Db } from '../../models/db.js';
import type { AppointmentMapData, MapMerchantPin, PlaceSummary } from '../../shared/types.js';
import type { PlacesCache } from '../places/placesCache.js';
import { includedTypesFor } from '../places/placesAdapter.js';
import type { PicksService } from '../picks/picksService.js';
import { toAppointment } from '../appointments/appointmentsService.js';
import { haversineMeters } from '../matching/geo.js';
import { phoenixClock } from '../time/phoenix.js';

export const PLACES_ATTRIBUTION = 'Places data © Google';

export class MapService {
  constructor(
    private readonly db: Db,
    private readonly picks: PicksService,
    private readonly places: PlacesCache,
    private readonly browserKeyConfigured: boolean,
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  private async placesFor(sessionId: string, lat: number, lng: number, radius: number, startMinutes: number): Promise<PlaceSummary[] | null> {
    if (!this.places.configured || !this.browserKeyConfigured) return null;
    try {
      // Cached per session and appointment point, shared with the agent's find_places_near (3.4.2).
      return await this.places.searchNearby(sessionId, { lat, lng, radiusMeters: radius, includedTypes: includedTypesFor(startMinutes) });
    } catch (err) {
      this.log(`places fallback used: ${(err as Error).message}; map drawn as the SVG plot`);
      return null;
    }
  }

  async mapData(sessionId: string, appointmentId: string): Promise<AppointmentMapData> {
    const { match, appt } = await this.picks.candidatesFor(sessionId, appointmentId);
    const center = { lat: appt.location_lat!, lng: appt.location_lng! };
    const radius = match.radiusMeters;
    const withOffer = new Set(match.candidates.map((c) => c.offer.merchantId));
    const { rows } = await this.db.query('SELECT id, name, location_lat, location_lng, is_sample FROM merchants ORDER BY id');
    const merchants: MapMerchantPin[] = rows
      .filter((m) => haversineMeters(center, { lat: m.location_lat, lng: m.location_lng }) <= radius)
      .map((m) => ({ merchantId: m.id, merchantName: m.name, location: { lat: m.location_lat, lng: m.location_lng }, isSample: m.is_sample, hasOffer: withOffer.has(m.id) }));
    const places = await this.placesFor(sessionId, center.lat, center.lng, radius, phoenixClock(appt.starts_at).minutes);
    return {
      appointment: toAppointment(appt),
      searchRadiusMeters: radius,
      renderMode: places ? 'google_maps' : 'svg_plot',
      places: places ?? [],
      placesAttributions: places && places.length > 0 ? [PLACES_ATTRIBUTION] : [],
      merchants,
    };
  }
}
