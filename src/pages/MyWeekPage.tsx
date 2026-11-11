// My week (F1.2, F2.1; REQ-01-02, REQ-01-03, REQ-08-01): the next 7 days of appointments with an address, grouped by
// day in America/Phoenix, each with an on/off switch (optimistic, reverted on failure) and a link to its picks;
// skipped events folded at the bottom with a short reason. The map sits above the list on a phone and on the right
// from 900 px (spec 3.11.2 Layout). Not connected (404) sends the shopper to Connect.
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Appointment, CalendarConnection, UpcomingAppointmentsResult } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { AppointmentToggle } from '@/components/appointments/AppointmentToggle';
import { WeekMap } from '@/components/map/WeekMap';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { api, useApiQuery } from '@/hooks/useApi';
import { prefetchPicks, usePicksPrefetch } from '@/hooks/usePicksPrefetch';
import { SKIP_REASON_TEXT, dayKey, formatDayHeading, formatEventWhen, formatTimeRange } from '@/client/format';

function groupByDay(appointments: Appointment[]): { key: string; heading: string; items: Appointment[] }[] {
  const groups: { key: string; heading: string; items: Appointment[] }[] = [];
  for (const a of [...appointments].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    const key = dayKey(a.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(a);
    else groups.push({ key, heading: formatDayHeading(a.startsAt), items: [a] });
  }
  return groups;
}

export function MyWeekPage() {
  const navigate = useNavigate();
  const connection = useApiQuery<CalendarConnection>('/api/calendar/connection');
  const week = useApiQuery<UpcomingAppointmentsResult>('/api/appointments/upcoming');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Picks for every appointment that is on, fetched in the background while the shopper reads the week.
  usePicksPrefetch(week.data?.appointments);

  // REQ-01-01: no calendar connected for this session -> Connect.
  const notConnected = connection.error?.status === 404 || week.error?.status === 404;
  useEffect(() => {
    if (notConnected) navigate('/connect', { replace: true });
  }, [notConnected, navigate]);

  const setEnabled = (id: string, enabled: boolean) =>
    week.setData((prev) => (prev ? { ...prev, appointments: prev.appointments.map((a) => (a.id === id ? { ...a, enabled } : a)) } : prev));

  // REQ-01-03: optimistic toggle; the save failing puts it back.
  const toggle = async (a: Appointment, next: boolean) => {
    setEnabled(a.id, next);
    setSaving((s) => new Set(s).add(a.id));
    try {
      const saved = await api.patch<Appointment>(`/api/appointments/${encodeURIComponent(a.id)}`, { enabled: next });
      setEnabled(a.id, saved.enabled);
      if (saved.enabled) prefetchPicks(a.id); // turned back on: get its picks ready too
    } catch {
      setEnabled(a.id, !next);
      toast.error(`Could not save that change. ${a.title} is back as it was.`);
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(a.id);
        return n;
      });
    }
  };

  const data = week.data;
  let content;
  if (week.loading && !data) {
    content = (
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading your week">
        <Skeleton className="aspect-[358/300] w-full rounded-card desk:order-2" />
        <div className="flex flex-col gap-3 desk:order-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      </div>
    );
  } else if (week.error && !notConnected) {
    content = <ErrorState title="Your week did not load" onRetry={week.reload} />;
  } else if (data) {
    const groups = groupByDay(data.appointments);
    content = (
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] desk:gap-8">
        {data.appointments.length > 0 && (
          <div className="desk:order-2">
            <div className="desk:sticky desk:top-4">
              <WeekMap appointments={data.appointments} activeId={activeId} onActiveChange={setActiveId} />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-6 desk:order-1">
          {data.appointments.length === 0 ? (
            <p className="rounded-card border border-border bg-card px-[18px] py-6 text-center text-[17px] font-semibold" data-testid="week-empty">
              No appointments with an address in the next 7 days.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-label={g.heading} className="flex flex-col gap-2.5">
                <h2 className="text-label uppercase text-secondary-text">{g.heading}</h2>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {g.items.map((a) => (
                    <li
                      key={a.id}
                      data-testid="appointment-row"
                      onMouseEnter={() => setActiveId(a.id)}
                      onMouseLeave={() => setActiveId(null)}
                      className={cn(
                        'flex items-center gap-2 rounded-card border bg-card p-2 pl-4 transition-colors duration-150',
                        activeId === a.id ? 'border-primary' : 'border-border',
                      )}
                    >
                      <Link
                        to={`/appointments/${a.id}`}
                        onFocus={() => setActiveId(a.id)}
                        onBlur={() => setActiveId(null)}
                        className={cn('flex min-h-touch min-w-0 flex-1 items-center gap-2 py-1.5 text-foreground no-underline hover:text-foreground', !a.enabled && 'text-secondary-text hover:text-secondary-text')}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-secondary-text">{formatTimeRange(a.startsAt, a.endsAt)}</span>
                          <span className="block text-[17px] font-bold leading-snug">{a.title}</span>
                          <span className="block truncate text-sm text-secondary-text">{a.address}</span>
                          {!a.enabled && <span className="block text-[13px] text-secondary-text">Off. Nearby skips this one.</span>}
                        </span>
                        <ChevronRight className="h-5 w-5 flex-none text-secondary-text" aria-hidden="true" />
                      </Link>
                      <AppointmentToggle
                        checked={a.enabled}
                        onChange={(next) => void toggle(a, next)}
                        disabled={saving.has(a.id)}
                        label={`Find picks for ${a.title}`}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {data.skippedEvents.length > 0 && (
            <details className="group rounded-card border border-border bg-card" data-testid="skipped-events">
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Skipped {data.skippedEvents.length === 1 ? '1 event' : `${data.skippedEvents.length} events`}
                </span>
                <ChevronRight className="h-5 w-5 text-secondary-text transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
              </summary>
              <ul className="m-0 flex list-none flex-col gap-2 border-t border-border p-4">
                {data.skippedEvents.map((e) => (
                  <li key={`${e.title}-${e.startsAt}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold">{e.title}</span>
                      <span className="text-secondary-text"> · {formatEventWhen(e.startsAt, e.reason === 'all_day')}</span>
                    </span>
                    <span className="flex-none text-secondary-text">{SKIP_REASON_TEXT[e.reason] ?? 'Skipped'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <PageShell side="shopper" mainClassName="pt-6">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold leading-tight">My week</h1>
        <p className="text-body-text">
          {connection.data
            ? `${connection.data.calendarName}: the next 7 days. Choose a stop to see its picks.`
            : 'The next 7 days. Choose a stop to see its picks.'}
        </p>
      </div>
      {content}
    </PageShell>
  );
}
