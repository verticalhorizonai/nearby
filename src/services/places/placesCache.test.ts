// One live Places call per session and point, even when the map and the agent ask at the same moment (PERF-02-05-01).
import { describe, expect, it } from 'vitest';
import { PlacesCache } from './placesCache.js';
import type { PlacesAdapter } from './placesAdapter.js';

describe('PlacesCache', () => {
  const req = { lat: 32.2318, lng: -110.9535, radiusMeters: 1609, includedTypes: ['cafe'] };
  it('concurrent and later reads of the same session and point share one live call', async () => {
    let live = 0;
    const adapter: PlacesAdapter = { configured: true, searchNearby: async () => { live++; await new Promise((r) => setTimeout(r, 50)); return []; } };
    const cache = new PlacesCache(adapter);
    await Promise.all([cache.searchNearby('s1', req), cache.searchNearby('s1', req), cache.searchNearby('s1', req)]);
    await cache.searchNearby('s1', req);
    expect(live).toBe(1);
    await cache.searchNearby('s2', req);
    expect(live).toBe(2); // another session is another entry
  });
  it('a failed call is not cached', async () => {
    let n = 0;
    const adapter: PlacesAdapter = { configured: true, searchNearby: async () => { n++; if (n === 1) throw new Error('down'); return []; } };
    const cache = new PlacesCache(adapter);
    await expect(cache.searchNearby('s1', req)).rejects.toThrow('down');
    await expect(cache.searchNearby('s1', req)).resolves.toEqual([]);
    expect(n).toBe(2);
  });
});
