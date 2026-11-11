// The demo back end of nearby-calendar-mcp (spec 3.2.1; REQ-01-04): the five sample appointments and the two skipped
// events of 3.10.2, each placed on the next occurrence of its weekday whose start is still in the future, in
// America/Phoenix time, so the demo never goes stale.
import { DEMO_CALENDAR_EVENTS, DEMO_CALENDAR_NAME } from '../../seed/sampleData.js';
import { dayIndex, phoenixClock, phoenixInstant } from '../time/phoenix.js';
import { toPhoenixIso } from '../time/iso.js';

export interface McpAppointment {
  id: string;
  title: string;
  start: string;
  end: string;
  location_text: string | null;
  all_day: boolean;
}

export const TITLE_MAX_CHARS = 80;
export const DEMO_BACKEND_CALENDAR_NAME = DEMO_CALENDAR_NAME;

export function trimTitle(title: string): string {
  const chars = [...title.trim()];
  return chars.length > TITLE_MAX_CHARS ? chars.slice(0, TITLE_MAX_CHARS).join('') : chars.join('');
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Upcoming demo events within daysAhead days of now, ordered by start. */
export function demoAppointments(now: Date, daysAhead: number): McpAppointment[] {
  const today = phoenixClock(now);
  const todayIdx = dayIndex(today.day);
  const horizon = now.getTime() + daysAhead * 86_400_000;
  const out: { at: number; a: McpAppointment }[] = [];
  for (const e of DEMO_CALENDAR_EVENTS) {
    const startMinutes = e.allDay ? 0 : (e.startMinutes ?? 0);
    let offset = (dayIndex(e.day) - todayIdx + 7) % 7;
    let start = phoenixInstant(addDays(today.dateKey, offset), startMinutes);
    if (start.getTime() <= now.getTime()) {
      offset += 7;
      start = phoenixInstant(addDays(today.dateKey, offset), startMinutes);
    }
    if (start.getTime() > horizon) continue;
    const end = new Date(start.getTime() + e.durationMinutes * 60_000);
    out.push({
      at: start.getTime(),
      a: { id: e.id, title: trimTitle(e.title), start: toPhoenixIso(start), end: toPhoenixIso(end), location_text: e.locationText, all_day: e.allDay },
    });
  }
  return out.sort((x, y) => x.at - y.at).map((x) => x.a);
}
