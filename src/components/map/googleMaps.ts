// Loads the Google Maps JavaScript API with the browser-restricted key from `GET /api/config/public` (REQ-02-01).
// Only the few classes the appointment map uses are typed here. Any failure (network, bad key, auth failure,
// timeout) rejects, and the caller falls back to the SVG plot without showing an error.

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface GMap {
  setCenter(c: LatLngLiteral): void;
}

export interface GOverlay {
  setMap(map: GMap | null): void;
}

export interface GMarker extends GOverlay {
  addListener(event: string, handler: () => void): unknown;
}

export interface GoogleMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Circle: new (opts: Record<string, unknown>) => GOverlay;
  Point: new (x: number, y: number) => unknown;
  SymbolPath: { CIRCLE: number };
}

interface GoogleWindow {
  google?: { maps?: GoogleMapsApi };
  gm_authFailure?: () => void;
}

const LOAD_TIMEOUT_MS = 10_000;
let loading: Promise<GoogleMapsApi> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** Subscribe to Google's auth-failure callback (a rejected key renders a broken map, not an error). */
export function onGoogleAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  if (authFailed) fn();
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps(key: string): Promise<GoogleMapsApi> {
  const w = window as unknown as GoogleWindow;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (loading) return loading;

  loading = new Promise<GoogleMapsApi>((resolve, reject) => {
    w.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((l) => l());
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error('Google Maps load timed out')), LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      const maps = (window as unknown as GoogleWindow).google?.maps;
      if (maps?.Map) resolve(maps);
      else reject(new Error('Google Maps loaded without its API'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}
