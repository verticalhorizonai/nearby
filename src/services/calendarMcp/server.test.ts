// nearby-calendar-mcp: the tool contract (3.2.2) and the demo back end's placement (3.2.1), over a real stdio child.
import { describe, expect, it, afterAll } from 'vitest';
import { McpCalendarSource } from './client.js';
import { demoAppointments, trimTitle } from './demoBackend.js';

describe('demo back end placement (America/Phoenix)', () => {
  it('places each event on the next occurrence of its weekday whose start is in the future', () => {
    const tue0929 = new Date('2026-11-17T16:29:00Z'); // Tue 9:29 Phoenix
    expect(demoAppointments(tue0929, 7)[0]).toMatchObject({ id: 'demo-tue-client-meeting', start: '2026-11-17T09:30:00-07:00', end: '2026-11-17T10:30:00-07:00' });
    const tue0930 = new Date('2026-11-17T16:30:00Z'); // exactly 9:30: no longer in the future
    const next = demoAppointments(tue0930, 7).find((a) => a.id === 'demo-tue-client-meeting');
    expect(next?.start).toBe('2026-11-24T09:30:00-07:00');
  });
  it('honours days_ahead and returns the 3.2.2 shape', () => {
    const mon = new Date('2026-11-16T15:00:00Z');
    const all = demoAppointments(mon, 7);
    expect(all).toHaveLength(7);
    expect(Object.keys(all[0]).sort()).toEqual(['all_day', 'end', 'id', 'location_text', 'start', 'title']);
    expect(demoAppointments(mon, 1)).toEqual([]); // Mon 8:00 + 24 h ends before Tue 9:30
    expect(demoAppointments(mon, 2).map((a) => a.id)).toEqual(['demo-tue-client-meeting', 'demo-tue-lunch-partner', 'demo-tue-team-call', 'demo-wed-pay-rent']);
  });
  it('trims titles to 80 characters', () => {
    expect(trimTitle('x'.repeat(80))).toHaveLength(80);
    expect(trimTitle('y'.repeat(81))).toHaveLength(80);
  });
});

describe('nearby-calendar-mcp over stdio', () => {
  const source = new McpCalendarSource();
  afterAll(async () => { await source.close(); });
  it('runs as a child process and lists the seven demo events by default', async () => {
    const events = await source.listUpcomingAppointments();
    expect(events).toHaveLength(7);
    const tool = await source.toolDefinition();
    expect(tool.name).toBe('list_upcoming_appointments');
    expect(JSON.stringify(tool.input_schema)).toContain('days_ahead');
  });
  it('refuses days_ahead over 14, below 1 or not an integer', async () => {
    await expect(source.listUpcomingAppointments(15)).rejects.toThrow();
    await expect(source.listUpcomingAppointments(0)).rejects.toThrow();
    await expect(source.listUpcomingAppointments(7.5)).rejects.toThrow();
    expect(await source.listUpcomingAppointments(14)).toHaveLength(7);
  });
});
