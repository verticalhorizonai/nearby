// The Places cache (spec 3.4.2 "Cache results per appointment for the session"; PERF-02-05-01; ruling 19): one
// in-process cache shared by the map route and the agent's find_places_near, so a session never makes a second live
// Places call for the same point and radius (an appointment's point, in practice).
import type { PlaceSummary } from '../../shared/types.js';
import type { PlacesAdapter, PlacesRequest } from './placesAdapter.js';

const TTL_MS = 30 * 24 * 3_600_000; // as long as the session cookie lives

export class PlacesCache {
  private readonly entries = new Map<string, { at: number; places: PlaceSummary[] }>();
  /** Calls still in flight, shared by concurrent readers (the map and the picks load together). */
  private readonly inflight = new Map<string, Promise<PlaceSummary[]>>();

  constructor(private readonly places: PlacesAdapter) {}

  get configured(): boolean {
    return this.places.configured;
  }

  static key(sessionId: string, req: PlacesRequest): string {
    return [sessionId, req.lat.toFixed(4), req.lng.toFixed(4), Math.round(req.radiusMeters), req.includedTypes.join('+')].join(':');
  }

  /** The cached answer for this session and request, or one live call through the Places adapter. Errors are not cached. */
  async searchNearby(sessionId: string, req: PlacesRequest): Promise<PlaceSummary[]> {
    const key = PlacesCache.key(sessionId, req);
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.places;
    const running = this.inflight.get(key);
    if (running) return running;
    const call = this.places
      .searchNearby(req)
      .then((places) => {
        this.entries.set(key, { at: Date.now(), places });
        return places;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, call);
    return call;
  }
}
