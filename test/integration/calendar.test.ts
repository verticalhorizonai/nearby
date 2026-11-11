// Connect the demo calendar, list the week, turn an appointment off (REQ-01-01..05; F1.1, F1.2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => { t = await createTestApp(); });
afterAll(async () => { await t.close(); });

describe('calendar connection over MCP', () => {
  it('reports not connected before the demo calendar is used', async () => {
    const r = await t.request('GET', '/api/calendar/connection', undefined, {}, 'fresh');
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('not_found');
  });

  it('connects the demo calendar: its name and five upcoming appointments', async () => {
    const r = await t.request('POST', '/api/calendar/demo-connection');
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ calendarName: 'Demo calendar', upcomingAppointmentCount: 5 });
    const again = await t.request('POST', '/api/calendar/demo-connection');
    expect(again.json.data.upcomingAppointmentCount).toBe(5);
    const n = await t.db.query('SELECT count(*)::int AS n FROM appointments');
    expect(n.rows[0].n).toBe(7); // five usable and two skipped, never duplicated
    const c = await t.request('GET', '/api/calendar/connection');
    expect(c.json.data.upcomingAppointmentCount).toBe(5);
  });

  it('lists the five appointments in order and the two skipped events with their reasons', async () => {
    const r = await t.request('GET', '/api/appointments/upcoming');
    expect(r.status).toBe(200);
    expect(r.json.data.appointments.map((a: { title: string }) => a.title)).toEqual(['Client meeting', 'Lunch with a partner', 'Workshop', 'Print pickup', 'Dinner']);
    expect(r.json.data.appointments[0]).toMatchObject({ address: 'Old Main, University of Arizona, Tucson', location: { lat: 32.2318, lng: -110.9535 }, enabled: true });
    expect(r.json.data.appointments[0].startsAt).toBe('2026-11-17T16:30:00.000Z'); // Tue 9:30 Phoenix
    expect(r.json.data.skippedEvents).toEqual([
      { title: 'Team call', startsAt: '2026-11-17T22:00:00.000Z', reason: 'video_call' },
      { title: 'Pay rent', startsAt: '2026-11-18T07:00:00.000Z', reason: 'all_day' },
    ]);
    expect(JSON.stringify(r.json.data)).not.toMatch(/description|attendee/);
  });

  it('turns an appointment off and back on; another session cannot', async () => {
    const list = await t.request('GET', '/api/appointments/upcoming');
    const id = list.json.data.appointments[0].id;
    const off = await t.request('PATCH', `/api/appointments/${id}`, { enabled: false });
    expect(off.json.data.enabled).toBe(false);
    const other = await t.request('PATCH', `/api/appointments/${id}`, { enabled: true }, {}, 'other');
    expect(other.status).toBe(404);
    const bad = await t.request('PATCH', `/api/appointments/${id}`, { enabled: 'no' });
    expect(bad.status).toBe(400);
    const picks = await t.request('GET', `/api/appointments/${id}/picks`);
    expect(picks.json.data).toEqual({ appointmentId: id, picks: [], noMatch: false });
    const on = await t.request('PATCH', `/api/appointments/${id}`, { enabled: true });
    expect(on.json.data.enabled).toBe(true);
  });

  it('refuses a write from another origin with 403 forbidden_origin', async () => {
    const r = await t.request('POST', '/api/calendar/demo-connection', undefined, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('forbidden_origin');
  });
});
