// ISO-8601 with the America/Phoenix offset (-07:00), as the calendar tool contract asks (spec 3.2.2).
import { PHOENIX_OFFSET_MINUTES } from './phoenix.js';

export function toPhoenixIso(at: Date): string {
  const shifted = new Date(at.getTime() + PHOENIX_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '-07:00');
}
