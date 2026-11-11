// Every time of day in Nearby is America/Phoenix: UTC-7, no daylight saving (spec 3.5.1). REQ-02-06, REQ-01-04.
import type { DayOfWeek } from '../../shared/types.js';

export const PHOENIX_OFFSET_MINUTES = -7 * 60;
const DAYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The Phoenix wall clock of an instant: weekday and minutes since local midnight. */
export function phoenixClock(at: Date): { day: DayOfWeek; minutes: number; dateKey: string } {
  const shifted = new Date(at.getTime() + PHOENIX_OFFSET_MINUTES * 60_000);
  return {
    day: DAYS[shifted.getUTCDay()],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    dateKey: shifted.toISOString().slice(0, 10),
  };
}

/** "HH:MM" to minutes since midnight; null when malformed. */
export function parseHhMm(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The instant of a Phoenix wall-clock time on a Phoenix calendar date (YYYY-MM-DD). */
export function phoenixInstant(dateKey: string, minutes: number): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - PHOENIX_OFFSET_MINUTES * 60_000);
}

export function dayIndex(day: DayOfWeek): number {
  return DAYS.indexOf(day);
}

/** "9:30 AM", "12:30 PM": a Phoenix time of day for people to read. */
export function formatTime(minutes: number, withMeridiem = true): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return withMeridiem ? `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}` : `${h12}:${mm}`;
}
