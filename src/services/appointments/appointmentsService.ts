// Appointments service (task 211; REQ-01-01, REQ-01-02, REQ-01-03, REQ-01-05): connects the session to the demo
// calendar through the MCP client, filters the events in code (3.2.3), resolves coordinates from the seed (3.3) and
// stores every event for the session with its skip reason (spec 3.9; build ruling 9).
import type { Db, DbClient } from '../../models/db.js';
import type { Appointment, AppointmentAddedBy, CalendarConnection, SkippedEvent, SkippedEventReason, UpcomingAppointment, UpcomingAppointmentsResult } from '../../shared/types.js';
import { APPOINTMENT_WINDOW_DAYS } from '../../shared/types.js';
import type { CalendarSource } from '../calendarMcp/client.js';
import { DEMO_APPOINTMENT_COORDINATES } from '../../seed/sampleData.js';
import { skipReason } from '../calendar/eventFilter.js';
import { notFound } from '../../api/http.js';

export interface AppointmentRow {
  id: string;
  session_id: string;
  source_event_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  location_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  skip_reason: SkippedEventReason | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
  added_by: AppointmentAddedBy;
}

export function toAppointment(r: AppointmentRow): Appointment {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    address: r.location_text ?? '',
    location: { lat: r.location_lat ?? 0, lng: r.location_lng ?? 0 },
    enabled: r.enabled,
    addedBy: r.added_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class AppointmentsService {
  constructor(
    private readonly db: Db,
    private readonly calendar: CalendarSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Reads the calendar through MCP and upserts every event for the session. Never duplicates; never touches `enabled`. */
  async syncFromCalendar(sessionId: string): Promise<void> {
    const events = await this.calendar.listUpcomingAppointments(APPOINTMENT_WINDOW_DAYS);
    for (const e of events) {
      const coords = DEMO_APPOINTMENT_COORDINATES[e.id] ?? null;
      const reason = skipReason(e, coords);
      await this.db.query(
        `INSERT INTO appointments (session_id, source_event_id, title, starts_at, ends_at, location_text, location_lat, location_lng, skip_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (session_id, source_event_id) DO UPDATE SET
           title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
           location_text = EXCLUDED.location_text, location_lat = EXCLUDED.location_lat,
           location_lng = EXCLUDED.location_lng, skip_reason = EXCLUDED.skip_reason`,
        [sessionId, e.id, e.title, e.start, e.end, e.location_text, reason ? null : coords?.lat ?? null, reason ? null : coords?.lng ?? null, reason],
      );
    }
  }

  private async rows(sessionId: string, client: DbClient = this.db): Promise<AppointmentRow[]> {
    const now = this.now();
    const until = new Date(now.getTime() + APPOINTMENT_WINDOW_DAYS * 86_400_000);
    const { rows } = await client.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE session_id = $1 AND starts_at > $2 AND starts_at <= $3 ORDER BY starts_at, source_event_id`,
      [sessionId, now, until],
    );
    return rows;
  }

  /** When the session connected the demo calendar. A stop an assistant handed over is not a connection (ruling 42). */
  private async isConnected(sessionId: string): Promise<Date | null> {
    const { rows } = await this.db.query<{ connected_at: Date | null }>(
      "SELECT min(created_at) AS connected_at FROM appointments WHERE session_id = $1 AND added_by = 'calendar'",
      [sessionId],
    );
    return rows[0]?.connected_at ?? null;
  }

  private async connection(sessionId: string, connectedAt: Date): Promise<CalendarConnection> {
    const usable = (await this.rows(sessionId)).filter((r) => r.skip_reason === null);
    return { calendarName: this.calendar.calendarName, upcomingAppointmentCount: usable.length, connectedAt: connectedAt.toISOString() };
  }

  /** POST /api/calendar/demo-connection. Idempotent for a session. */
  async connectDemo(sessionId: string): Promise<CalendarConnection> {
    await this.syncFromCalendar(sessionId);
    const connectedAt = (await this.isConnected(sessionId)) ?? this.now();
    return this.connection(sessionId, connectedAt);
  }

  /** GET /api/calendar/connection. 404 when the session never connected. */
  async getConnection(sessionId: string): Promise<CalendarConnection> {
    const connectedAt = await this.isConnected(sessionId);
    if (!connectedAt) throw notFound('No calendar is connected for this session.');
    return this.connection(sessionId, connectedAt);
  }

  /**
   * GET /api/appointments/upcoming: refreshes from the calendar (dates roll forward), then lists. The stops an assistant
   * handed over are listed with the calendar's (ruling 42); a session with neither is not connected (404).
   */
  async upcoming(sessionId: string): Promise<UpcomingAppointmentsResult> {
    if (await this.isConnected(sessionId)) {
      await this.syncFromCalendar(sessionId);
    } else {
      const { rows } = await this.db.query("SELECT 1 FROM appointments WHERE session_id = $1 AND added_by = 'assistant' LIMIT 1", [sessionId]);
      if (rows.length === 0) throw notFound('No calendar is connected for this session.');
    }
    const rows = await this.rows(sessionId);
    // Completed purchases per appointment in this session: the "bought" pill of My week (build ruling 36).
    const bought = await this.db.query<{ appointment_id: string; n: number }>(
      `SELECT p.appointment_id, count(*)::int AS n FROM purchases u JOIN proposals p ON p.id = u.proposal_id
        WHERE p.session_id = $1 AND u.status = 'completed' GROUP BY p.appointment_id`,
      [sessionId],
    );
    const boughtBy = new Map(bought.rows.map((r) => [r.appointment_id, r.n]));
    const appointments: UpcomingAppointment[] = rows
      .filter((r) => r.skip_reason === null)
      .map((r) => ({ ...toAppointment(r), boughtCount: boughtBy.get(r.id) ?? 0 }));
    const skippedEvents: SkippedEvent[] = rows
      .filter((r) => r.skip_reason !== null)
      .map((r) => ({ title: r.title, startsAt: r.starts_at.toISOString(), reason: r.skip_reason as SkippedEventReason }));
    return { appointments, skippedEvents };
  }

  /** A usable appointment of this session, or 404 (another session's is not found). */
  async get(sessionId: string, appointmentId: string, client: DbClient = this.db): Promise<AppointmentRow> {
    const { rows } = await client.query<AppointmentRow>(
      'SELECT * FROM appointments WHERE id = $1 AND session_id = $2 AND skip_reason IS NULL',
      [appointmentId, sessionId],
    );
    if (!rows[0]) throw notFound('No appointment exists with this id.');
    return rows[0];
  }

  /** PATCH /api/appointments/{id}: turn an appointment off or back on (REQ-01-03). */
  async setEnabled(sessionId: string, appointmentId: string, enabled: boolean): Promise<Appointment> {
    const { rows } = await this.db.query<AppointmentRow>(
      'UPDATE appointments SET enabled = $3 WHERE id = $1 AND session_id = $2 AND skip_reason IS NULL RETURNING *',
      [appointmentId, sessionId, enabled],
    );
    if (!rows[0]) throw notFound('No appointment exists with this id.');
    return toAppointment(rows[0]);
  }
}
