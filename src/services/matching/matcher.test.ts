// The expected-results table of spec 3.10.3 as the matcher's test, pick for pick and score for score (G-20).
import { describe, expect, it } from 'vitest';
import { matchOffers, roundScore, type MatchOffer, type MatchAppointment, RADIUS_NEAR_M } from './matcher.js';
import { SAMPLE_MERCHANTS, SAMPLE_OFFERS, DEMO_CALENDAR_EVENTS, DEMO_APPOINTMENT_COORDINATES } from '../../seed/sampleData.js';
import { phoenixInstant } from '../time/phoenix.js';
import { haversineMeters, METERS_PER_MILE } from './geo.js';

const offers: MatchOffer[] = SAMPLE_OFFERS.map((o) => {
  const m = SAMPLE_MERCHANTS.find((x) => x.id === o.merchantId)!;
  return { id: o.id, merchantId: m.id, merchantName: m.name, merchantLocation: { lat: m.lat, lng: m.lng }, category: o.category, validDays: o.validDays, validStartTime: o.validStartTime, validEndTime: o.validEndTime };
});
// 2026-11-17 is a Tuesday.
const DATE: Record<string, string> = { tue: '2026-11-17', wed: '2026-11-18', thu: '2026-11-19' };
function appt(eventId: string): MatchAppointment {
  const e = DEMO_CALENDAR_EVENTS.find((x) => x.id === eventId)!;
  const start = phoenixInstant(DATE[e.day], e.startMinutes!);
  return { id: e.id, startsAt: start, endsAt: new Date(start.getTime() + e.durationMinutes * 60_000), location: DEMO_APPOINTMENT_COORDINATES[e.id] };
}
const mi = (m: number) => Math.round((m / METERS_PER_MILE) * 100) / 100;
const shown = (id: string) => matchOffers(appt(id), offers).shown.map((c) => [c.offer.merchantName, mi(c.distanceMeters), roundScore(c.score)]);

describe('spec 3.10.3 expected results', () => {
  it('Tue 9:30 Old Main: Saguaro Bean 0.20 mi (0.90), Sonoran Print 0.48 mi (0.41); Noodle Bar dropped (Poor)', () => {
    expect(shown('demo-tue-client-meeting')).toEqual([['Saguaro Bean Co.', 0.2, 0.9], ['Sonoran Print Shop', 0.48, 0.41]]);
    const all = matchOffers(appt('demo-tue-client-meeting'), offers).candidates.map((c) => c.offer.merchantName);
    expect(all).not.toContain('Fourth Ave Noodle Bar');
  });
  it('Tue 12:30 Fourth Ave: Noodle Bar 0.16 mi (0.92), Juicery 0.70 mi (0.45); Congress Street Desk 0.49 mi (0.41) third', () => {
    expect(shown('demo-tue-lunch-partner')).toEqual([['Fourth Ave Noodle Bar', 0.16, 0.92], ['Barrio Press Juicery', 0.7, 0.45]]);
    const third = matchOffers(appt('demo-tue-lunch-partner'), offers).candidates[2];
    expect([third.offer.merchantName, mi(third.distanceMeters), roundScore(third.score)]).toEqual(['Congress Street Desk', 0.49, 0.41]);
  });
  it('Wed 10:00 Congress St: Congress Street Desk 0.06 mi (0.62), Noodle Bar 0.60 mi (0.50); Juicery not valid', () => {
    expect(shown('demo-wed-workshop')).toEqual([['Congress Street Desk', 0.06, 0.62], ['Fourth Ave Noodle Bar', 0.6, 0.5]]);
    expect(matchOffers(appt('demo-wed-workshop'), offers).candidates.map((c) => c.offer.merchantName)).not.toContain('Barrio Press Juicery');
  });
  it('Wed 2:00 Speedway: Sonoran Print 0.06 mi (0.62), Noodle Bar 0.63 mi (0.48); Saguaro Bean closed', () => {
    expect(shown('demo-wed-print-pickup')).toEqual([['Sonoran Print Shop', 0.06, 0.62], ['Fourth Ave Noodle Bar', 0.63, 0.48]]);
    expect(matchOffers(appt('demo-wed-print-pickup'), offers).candidates.map((c) => c.offer.merchantName)).not.toContain('Saguaro Bean Co.');
  });
  it('Thu 5:30 River Rd: Rillito Tacos 0.10 mi (0.95), no second pick; everything else over 2 miles', () => {
    expect(shown('demo-thu-dinner')).toEqual([['Rillito Tacos', 0.1, 0.95]]);
    const a = appt('demo-thu-dinner');
    for (const o of offers.filter((x) => x.merchantName !== 'Rillito Tacos')) {
      expect(haversineMeters(a.location, o.merchantLocation) / METERS_PER_MILE).toBeGreaterThan(2);
    }
  });
});

describe('matching edges (3.5.1, 3.5.3)', () => {
  const base: MatchOffer = { id: 'x', merchantId: 'm', merchantName: 'M', merchantLocation: { lat: 32.2318, lng: -110.9535 }, category: 'service', validDays: ['tue'], validStartTime: '08:00', validEndTime: '18:00' };
  const a = appt('demo-tue-client-meeting');
  const at = (meters: number) => ({ ...base, merchantLocation: { lat: a.location.lat + meters / 111_195, lng: a.location.lng } });
  it('a merchant at 1,609 m is in at 1 mile; past it, the search widens', () => {
    const near = matchOffers(a, [at(1608.9)]);
    expect(near.radiusMeters).toBe(RADIUS_NEAR_M);
    const far = matchOffers(a, [at(1700)]);
    expect(far.radiusMeters).toBe(4828);
    expect(far.candidates).toHaveLength(1);
  });
  it('an offer ending exactly at the window start does not overlap; one starting a minute before the window ends does', () => {
    // window for Tue 9:30-10:30 is 8:45 to 11:30
    expect(matchOffers(a, [{ ...base, validStartTime: '07:00', validEndTime: '08:45' }]).candidates).toHaveLength(0);
    expect(matchOffers(a, [{ ...base, validStartTime: '11:29', validEndTime: '12:00' }]).candidates).toHaveLength(1);
    expect(matchOffers(a, [{ ...base, validStartTime: '11:30', validEndTime: '12:00' }]).candidates).toHaveLength(0);
  });
  it('the weekday is read in Phoenix time, not UTC', () => {
    const thu = appt('demo-thu-dinner'); // 17:30 Phoenix Thursday = 00:30 UTC Friday
    expect(thu.startsAt.getUTCDay()).toBe(5);
    expect(matchOffers(thu, [{ ...base, merchantLocation: thu.location, validDays: ['thu'], validStartTime: '16:00', validEndTime: '20:00' }]).candidates).toHaveLength(1);
  });
  it('an already bought offer is excluded', () => {
    expect(matchOffers(a, [base], new Set(['x'])).candidates).toHaveLength(0);
  });
  it('equal scores: nearer first, then offer id', () => {
    const r = matchOffers(a, [{ ...at(100), id: 'b' }, { ...at(100), id: 'a' }, { ...at(50), id: 'c' }]);
    expect(r.candidates.map((c) => c.offer.id)).toEqual(['c', 'a', 'b']);
  });
  it('a score of 0.35 is shown; below it is not', () => {
    // service fit 0.3: score = 0.5*ds + 0.15; 0.35 needs ds = 0.4 => distance = 0.6 * 1609
    const exact = matchOffers(a, [at(0.6 * 1609)]);
    expect(roundScore(exact.candidates[0].score)).toBe(0.35);
    expect(exact.shown).toHaveLength(1);
    expect(matchOffers(a, [at(0.6 * 1609 + 2)]).shown).toHaveLength(0);
  });
  it('a juice or snack offer with a Poor fit is dropped (build ruling 6)', () => {
    const start = phoenixInstant('2026-11-19', 18 * 60); // Thu 18:00: juice Poor (OK ends 17:59)
    const d = { id: 'd', startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), location: { lat: 32.2838, lng: -110.9465 } };
    const juice = { ...base, merchantLocation: d.location, category: 'juice_or_snack' as const, validDays: ['thu' as const], validStartTime: '14:00', validEndTime: '20:00' };
    expect(matchOffers(d, [juice]).candidates).toHaveLength(0);
    const ok = { ...d, startsAt: phoenixInstant('2026-11-19', 17 * 60 + 59), endsAt: phoenixInstant('2026-11-19', 18 * 60 + 59) };
    expect(matchOffers(ok, [juice]).candidates).toHaveLength(1);
  });
});
