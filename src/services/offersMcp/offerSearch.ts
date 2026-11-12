// Nearby's offers for any agent (build ruling 42): the read-only search behind the public MCP tools find_offers_near
// and get_offer, and the re-check the checkout handoff runs. It uses the app's own matching code (3.5) on the app's
// own offers: no model, no outside call, no write, no session.
import type { Db } from '../../models/db.js';
import type { DayOfWeek, GeoPoint, OfferCategory } from '../../shared/types.js';
import { APPOINTMENT_WINDOW_DAYS, ASSISTANT_STOP_MINUTES, MCP_MAX_RADIUS_MILES } from '../../shared/types.js';
import { matchOffers, roundScore, type Candidate } from '../matching/matcher.js';
import { haversineMeters, METERS_PER_MILE } from '../matching/geo.js';
import { DOWNTOWN_TUCSON, MAX_DISTANCE_FROM_DOWNTOWN_M } from '../calendar/eventFilter.js';
import { loadMatchOffers, visibleOffersSql } from '../picks/picksService.js';
import { formatMiles, formatValidWindow } from '../agent/fallback.js';

/** ISO 8601 date and time with an offset (Z or ±HH:MM), as the tools require. */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OUT_OF_AREA_NOTE =
  'That place is outside the demo area. Nearby is a sandbox demonstration with sample merchants around Tucson, Arizona, so it has no offers there.';
export const OUTSIDE_WINDOW_NOTE = `Nearby looks at the next ${APPOINTMENT_WINDOW_DAYS} days. Give a start time after now and within ${APPOINTMENT_WINDOW_DAYS} days.`;
export const NOTHING_FITS_NOTE = 'Nothing nearby fits this place and time.';

/** A place and a start time an assistant gives. The stop is matched as an ASSISTANT_STOP_MINUTES appointment. */
export interface StopQuery {
  location: GeoPoint;
  startsAt: Date;
  endsAt: Date;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Parses a latitude, a longitude and an ISO start with an offset; null with the reason when one is not valid. */
export function parseStop(lat: unknown, lng: unknown, at: unknown): { stop: StopQuery } | { error: string } {
  const la = typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : lat;
  const ln = typeof lng === 'string' && lng.trim() !== '' ? Number(lng) : lng;
  if (typeof la !== 'number' || !Number.isFinite(la) || la < -90 || la > 90) return { error: 'lat must be a latitude between -90 and 90.' };
  if (typeof ln !== 'number' || !Number.isFinite(ln) || ln < -180 || ln > 180) return { error: 'lng must be a longitude between -180 and 180.' };
  if (typeof at !== 'string' || !ISO_WITH_OFFSET.test(at) || Number.isNaN(Date.parse(at))) {
    return { error: 'starts_at must be an ISO 8601 date and time with an offset, for example 2026-11-17T09:30:00-07:00.' };
  }
  const startsAt = new Date(at);
  return { stop: { location: { lat: la, lng: ln }, startsAt, endsAt: new Date(startsAt.getTime() + ASSISTANT_STOP_MINUTES * 60_000) } };
}

/** True when the place is inside the demo area: the same 30-mile rule as calendar events (3.2.3). */
export function inDemoArea(location: GeoPoint): boolean {
  return haversineMeters(location, DOWNTOWN_TUCSON) <= MAX_DISTANCE_FROM_DOWNTOWN_M;
}

/** True when the start is after now and within the week My week shows. */
export function inWindow(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime() && startsAt.getTime() <= now.getTime() + APPOINTMENT_WINDOW_DAYS * 86_400_000;
}

/** The checkout link for an offer at a place and time: an app page a person opens; opening it changes nothing. */
export function checkoutUrl(appBaseUrl: string, offerId: string, stop: StopQuery, at: string): string {
  const q = new URLSearchParams({ offer: offerId, lat: String(stop.location.lat), lng: String(stop.location.lng), at });
  return `${appBaseUrl.replace(/\/$/, '')}/handoff?${q.toString()}`;
}

export interface OfferFacts {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_is_sample: boolean;
  title: string;
  price_cents: number;
  is_deposit: boolean;
  category: OfferCategory;
  valid_days: DayOfWeek[];
  valid_start_time: string;
  valid_end_time: string;
}

/** One offer this session may see (build ruling 44); sessionId null (the MCP tools): a seed offer only. */
export async function loadOfferFacts(db: Db, offerId: string, sessionId: string | null): Promise<OfferFacts | null> {
  if (!isUuid(offerId)) return null;
  const { rows } = await db.query<OfferFacts>(
    `SELECT o.id, o.merchant_id, m.name AS merchant_name, m.is_sample AS merchant_is_sample, o.title, o.price_cents::int AS price_cents,
            o.is_deposit, o.category, o.valid_days, o.valid_start_time, o.valid_end_time
       FROM offers o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1 AND ${visibleOffersSql('o', 2)}`,
    [offerId, sessionId],
  );
  return rows[0] ?? null;
}

/** "$4.50". Integer cents in, text out. */
export function formatPrice(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** The fields an offer is returned with, without the distance (get_offer) or with it (find_offers_near). */
export function offerFields(f: OfferFacts) {
  return {
    offer_id: f.id,
    merchant: f.merchant_name,
    sample: f.merchant_is_sample,
    title: f.title,
    price: formatPrice(f.price_cents),
    price_cents: f.price_cents,
    deposit: f.is_deposit,
    valid_window: { days: f.valid_days, hours: formatValidWindow(f.valid_start_time, f.valid_end_time) },
  };
}

/**
 * The app's matching (3.5) for a stop, over the offers the session may see (sessionId null, the MCP tools: the seed
 * offers only; build ruling 44). alreadyBought holds offers a session bought for that stop.
 */
export async function matchStop(db: Db, stop: StopQuery, sessionId: string | null, alreadyBought: ReadonlySet<string> = new Set()) {
  return matchOffers(
    { id: 'assistant-stop', startsAt: stop.startsAt, endsAt: stop.endsAt, location: stop.location },
    await loadMatchOffers(db, sessionId),
    alreadyBought,
  );
}

/** A candidate that may be shown: it passed the four rules and scores at least 0.35 (3.5.3). */
export function showable(candidates: Candidate[], offerId: string): Candidate | null {
  return candidates.find((c) => c.offer.id === offerId && c.score >= 0.35 - 1e-9) ?? null;
}

export class OfferSearch {
  constructor(
    private readonly db: Db,
    private readonly appBaseUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** find_offers_near: the offers Nearby would show for a stop at this place and time, best first. */
  async findNear(input: { lat: unknown; lng: unknown; starts_at: unknown; radius_miles?: unknown }) {
    const parsed = parseStop(input.lat, input.lng, input.starts_at);
    if ('error' in parsed) return { error: parsed.error };
    const { stop } = parsed;
    let radiusMiles: number = MCP_MAX_RADIUS_MILES;
    if (input.radius_miles !== undefined && input.radius_miles !== null) {
      const r = Number(input.radius_miles);
      if (!Number.isFinite(r) || r <= 0) return { error: `radius_miles must be a number above 0 (at most ${MCP_MAX_RADIUS_MILES}).` };
      radiusMiles = Math.min(r, MCP_MAX_RADIUS_MILES);
    }
    if (!inDemoArea(stop.location)) return { offers: [], note: OUT_OF_AREA_NOTE };
    if (!inWindow(stop.startsAt, this.now())) return { offers: [], note: OUTSIDE_WINDOW_NOTE };
    const match = await matchStop(this.db, stop, null);
    const within = match.shown.filter((c) => c.distanceMeters <= radiusMiles * METERS_PER_MILE);
    const offers = [];
    for (const c of within) {
      const facts = await loadOfferFacts(this.db, c.offer.id, null);
      if (!facts) continue;
      const { valid_window, ...head } = offerFields(facts);
      offers.push({
        ...head,
        distance: formatMiles(c.distanceMeters),
        valid_window,
        time_fit: c.timeFit,
        score: roundScore(c.score),
        checkout_url: checkoutUrl(this.appBaseUrl, c.offer.id, stop, String(input.starts_at)),
      });
    }
    return { offers, note: offers.length === 0 ? NOTHING_FITS_NOTE : null };
  }

  /**
   * get_offer: one offer's facts. With lat, lng and starts_at it also gives the time fit, the score and the checkout
   * link for that stop (still no distance); without them those three are null (ruling 42).
   */
  async getOffer(input: { offer_id: unknown; lat?: unknown; lng?: unknown; starts_at?: unknown }) {
    const facts = typeof input.offer_id === 'string' ? await loadOfferFacts(this.db, input.offer_id, null) : null;
    if (!facts) return { error: 'No offer exists with this offer_id.' };
    const base = offerFields(facts);
    const none = { ...base, time_fit: null, score: null, checkout_url: null };
    const given = [input.lat, input.lng, input.starts_at].filter((v) => v !== undefined && v !== null).length;
    if (given === 0) return { offer: none, note: 'Give lat, lng and starts_at to get the time fit, the score and a checkout link for a stop.' };
    if (given < 3) return { error: 'Give lat, lng and starts_at together, or none of them.' };
    const parsed = parseStop(input.lat, input.lng, input.starts_at);
    if ('error' in parsed) return { error: parsed.error };
    const { stop } = parsed;
    if (!inDemoArea(stop.location)) return { offer: none, note: OUT_OF_AREA_NOTE };
    if (!inWindow(stop.startsAt, this.now())) return { offer: none, note: OUTSIDE_WINDOW_NOTE };
    const c = showable((await matchStop(this.db, stop, null)).candidates, facts.id);
    if (!c) return { offer: none, note: 'This offer does not fit that place and time.' };
    return {
      offer: { ...base, time_fit: c.timeFit, score: roundScore(c.score), checkout_url: checkoutUrl(this.appBaseUrl, facts.id, stop, String(input.starts_at)) },
      note: null,
    };
  }
}
