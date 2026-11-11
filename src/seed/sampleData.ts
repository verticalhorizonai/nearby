// [Sample] Every merchant, offer and appointment here is made up for the Nearby demonstration (spec 3.10). None is a
// real business or person. Coordinates are approximate area centres in Tucson. REQ-06-01.
import type { DayOfWeek, OfferCategory } from '../shared/types.js';

export interface SampleMerchant {
  id: string;
  name: string;
  type: string;
  area: string;
  lat: number;
  lng: number;
}

export interface SampleOffer {
  id: string;
  merchantId: string;
  title: string;
  category: OfferCategory;
  priceCents: number;
  regularPriceCents: number | null;
  validDays: DayOfWeek[];
  validStartTime: string;
  validEndTime: string;
  isDeposit: boolean;
}

const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAILY: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const m = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const o = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

/** The eight sample merchants of spec 3.10.1. */
export const SAMPLE_MERCHANTS: SampleMerchant[] = [
  { id: m(1), name: 'Saguaro Bean Co.', type: 'Coffee shop', area: 'near the university', lat: 32.2319, lng: -110.9501 },
  { id: m(2), name: 'Fourth Ave Noodle Bar', type: 'Lunch', area: 'Fourth Avenue', lat: 32.2275, lng: -110.9625 },
  { id: m(3), name: 'Congress Street Desk', type: 'Coworking', area: 'downtown', lat: 32.2217, lng: -110.971 },
  { id: m(4), name: 'Barrio Press Juicery', type: 'Juice bar', area: 'south of downtown', lat: 32.216, lng: -110.968 },
  { id: m(5), name: 'Catalina Cuts', type: 'Barber', area: 'midtown', lat: 32.25, lng: -110.944 },
  { id: m(6), name: 'Rillito Tacos', type: 'Dinner', area: 'River Road', lat: 32.283, lng: -110.945 },
  { id: m(7), name: 'Sonoran Print Shop', type: 'Printing', area: 'Speedway', lat: 32.236, lng: -110.96 },
  { id: m(8), name: 'Mesquite Dog Wash', type: 'Pet care', area: 'midtown', lat: 32.25, lng: -110.955 },
];

/** One offer per sample merchant (spec 3.10.1); hours the demo kit did not give are the spec's seed hours. */
export const SAMPLE_OFFERS: SampleOffer[] = [
  { id: o(1), merchantId: m(1), title: 'Any drink plus pastry', category: 'coffee', priceCents: 600, regularPriceCents: null, validDays: WEEKDAYS, validStartTime: '07:00', validEndTime: '11:00', isDeposit: false },
  { id: o(2), merchantId: m(2), title: '15% off lunch for one', category: 'lunch', priceCents: 150, regularPriceCents: null, validDays: WEEKDAYS, validStartTime: '11:00', validEndTime: '14:00', isDeposit: true },
  { id: o(3), merchantId: m(3), title: 'Day pass', category: 'service', priceCents: 1500, regularPriceCents: 2500, validDays: WEEKDAYS, validStartTime: '08:00', validEndTime: '18:00', isDeposit: false },
  { id: o(4), merchantId: m(4), title: 'Second smoothie half off', category: 'juice_or_snack', priceCents: 400, regularPriceCents: null, validDays: DAILY, validStartTime: '14:00', validEndTime: '20:00', isDeposit: false },
  { id: o(5), merchantId: m(5), title: '$5 off a cut', category: 'service', priceCents: 2000, regularPriceCents: 2500, validDays: ['tue', 'wed', 'thu', 'fri', 'sat'], validStartTime: '08:00', validEndTime: '18:00', isDeposit: false },
  { id: o(6), merchantId: m(6), title: 'Free horchata with two tacos', category: 'dinner', priceCents: 900, regularPriceCents: null, validDays: DAILY, validStartTime: '16:00', validEndTime: '20:00', isDeposit: false },
  { id: o(7), merchantId: m(7), title: '50 business cards', category: 'service', priceCents: 1200, regularPriceCents: null, validDays: WEEKDAYS, validStartTime: '08:00', validEndTime: '18:00', isDeposit: false },
  { id: o(8), merchantId: m(8), title: 'Self-serve wash', category: 'service', priceCents: 1000, regularPriceCents: null, validDays: DAILY, validStartTime: '08:00', validEndTime: '18:00', isDeposit: false },
];

export interface DemoCalendarEvent {
  /** Calendar event id (3.2.2 `id`). */
  id: string;
  title: string;
  day: DayOfWeek;
  /** Phoenix minutes since midnight; null for an all-day event. */
  startMinutes: number | null;
  durationMinutes: number;
  locationText: string | null;
  allDay: boolean;
}

/** The demo calendar back end of nearby-calendar-mcp (spec 3.2.1, 3.10.2): five appointments and two skipped events. */
export const DEMO_CALENDAR_NAME = 'Demo calendar';
export const DEMO_CALENDAR_EVENTS: DemoCalendarEvent[] = [
  { id: 'demo-tue-client-meeting', title: 'Client meeting', day: 'tue', startMinutes: 9 * 60 + 30, durationMinutes: 60, locationText: 'Old Main, University of Arizona, Tucson', allDay: false },
  { id: 'demo-tue-lunch-partner', title: 'Lunch with a partner', day: 'tue', startMinutes: 12 * 60 + 30, durationMinutes: 60, locationText: 'Fourth Avenue, Tucson', allDay: false },
  { id: 'demo-tue-team-call', title: 'Team call', day: 'tue', startMinutes: 15 * 60, durationMinutes: 30, locationText: 'https://zoom.us/j/5550100000', allDay: false },
  { id: 'demo-wed-workshop', title: 'Workshop', day: 'wed', startMinutes: 10 * 60, durationMinutes: 60, locationText: 'Congress Street, downtown Tucson', allDay: false },
  { id: 'demo-wed-pay-rent', title: 'Pay rent', day: 'wed', startMinutes: null, durationMinutes: 24 * 60, locationText: null, allDay: true },
  { id: 'demo-wed-print-pickup', title: 'Print pickup', day: 'wed', startMinutes: 14 * 60, durationMinutes: 60, locationText: 'Speedway Blvd, Tucson', allDay: false },
  { id: 'demo-thu-dinner', title: 'Dinner', day: 'thu', startMinutes: 17 * 60 + 30, durationMinutes: 60, locationText: 'River Road, Tucson', allDay: false },
];

/** The seed's coordinates for the five sample appointments (spec 3.3, 3.10.2), by calendar event id. */
export const DEMO_APPOINTMENT_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'demo-tue-client-meeting': { lat: 32.2318, lng: -110.9535 },
  'demo-tue-lunch-partner': { lat: 32.2255, lng: -110.964 },
  'demo-wed-workshop': { lat: 32.2215, lng: -110.97 },
  'demo-wed-print-pickup': { lat: 32.2362, lng: -110.959 },
  'demo-thu-dinner': { lat: 32.2838, lng: -110.9465 },
};
