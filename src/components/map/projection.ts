// Equirectangular projection around the appointment, scaled so the search radius fits the plot (spec 3.11.2 The
// map: "Nearby's merchants at their true relative positions"; REQ-02-01). Good to well under a metre at 3 miles.
import type { GeoPoint } from '@/shared/types';

const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

/** Offset of `p` from `origin` in metres: x east, y north. */
export function offsetMeters(origin: GeoPoint, p: GeoPoint): { x: number; y: number } {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (p.lng - origin.lng) * METERS_PER_DEG_LNG_AT_EQUATOR * cosLat,
    y: (p.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

export interface PlotFrame {
  cx: number;
  cy: number;
  /** Pixels per metre. */
  scale: number;
}

/** A frame centred on the appointment where `radiusMeters` spans `radiusPx`. */
export function frameFor(width: number, height: number, radiusMeters: number, radiusPx: number): PlotFrame {
  return { cx: width / 2, cy: height / 2, scale: radiusPx / Math.max(radiusMeters, 1) };
}

/** Screen position of `p` in the frame (y grows downward). */
export function project(frame: PlotFrame, origin: GeoPoint, p: GeoPoint): { x: number; y: number } {
  const o = offsetMeters(origin, p);
  return { x: frame.cx + o.x * frame.scale, y: frame.cy - o.y * frame.scale };
}

/** A frame that fits every point in the box with `pad` pixels to spare (the My week overview map). */
export function fitFrame(points: GeoPoint[], width: number, height: number, pad: number): { origin: GeoPoint; frame: PlotFrame } {
  if (points.length === 0) return { origin: { lat: 0, lng: 0 }, frame: { cx: width / 2, cy: height / 2, scale: 1 } };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const origin = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  const offs = points.map((p) => offsetMeters(origin, p));
  const spanX = Math.max(...offs.map((o) => Math.abs(o.x)), 1);
  const spanY = Math.max(...offs.map((o) => Math.abs(o.y)), 1);
  const scale = Math.min((width / 2 - pad) / spanX, (height / 2 - pad) / spanY);
  return { origin, frame: { cx: width / 2, cy: height / 2, scale } };
}
