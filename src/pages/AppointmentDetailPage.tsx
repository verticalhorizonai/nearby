// Appointment detail (F2.1, F2.2, F3.1, F3.2; REQ-02-01..03, REQ-08-01; design/appointment-detail.html): the header
// block (day, time range, title, address), the map with radius, places and offer pins, then the picks. On a phone
// the map sits above the picks; from 900 px the picks are on the left and the map on the right (spec 3.11.2 Layout).
import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { AppointmentMapData } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { AppointmentMap } from '@/components/map/AppointmentMap';
import { PicksPanel } from '@/components/picks/PicksPanel';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/useApi';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { formatDayTimeRange } from '@/client/format';

export function AppointmentDetailPage() {
  const { appointmentId = '' } = useParams();
  const mapQuery = useApiQuery<AppointmentMapData>(`/api/appointments/${encodeURIComponent(appointmentId)}/map`);
  const config = usePublicConfig();
  const appt = mapQuery.data?.appointment;
  const notFound = mapQuery.error?.status === 404 || mapQuery.error?.status === 400;

  return (
    <PageShell side="shopper" mainClassName="pt-0">
      <div className="flex items-center gap-2.5 pb-3 pt-3.5">
        <Link
          to="/week"
          aria-label="Back to my week"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-outline-border bg-card text-foreground hover:bg-tint hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          {appt ? (
            <>
              <p className="text-[13px] font-semibold text-secondary-text">{formatDayTimeRange(appt.startsAt, appt.endsAt)}</p>
              <h1 className="font-display text-[22px] font-bold leading-[1.15]">{appt.title}</h1>
              <p className="text-sm text-secondary-text">{appt.address}</p>
            </>
          ) : mapQuery.loading ? (
            <div className="flex flex-col gap-1.5" aria-hidden="true">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <h1 className="font-display text-[22px] font-bold leading-[1.15]">Appointment</h1>
          )}
        </div>
      </div>

      {notFound ? (
        <ErrorState title="This appointment is not here" message="It may be outside this week, or the demo was reset. Go back to My week to choose another.">
          <Link to="/week" className="flex min-h-touch items-center px-2 font-semibold">
            Back to my week
          </Link>
        </ErrorState>
      ) : (
        <div className="grid grid-cols-1 gap-0 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] desk:gap-8">
          <div className="desk:order-2">
            <div className="desk:sticky desk:top-4">
              {mapQuery.data && (mapQuery.data.renderMode === 'svg_plot' || config !== undefined) ? (
                <AppointmentMap data={mapQuery.data} browserKey={config?.googleMapsBrowserKey ?? null} />
              ) : mapQuery.error ? (
                <ErrorState title="The map did not load" message="The picks below still work. Try the map again in a moment." onRetry={mapQuery.reload} />
              ) : (
                <Skeleton className="aspect-[358/260] w-full rounded-card" aria-label="Loading the map" />
              )}
            </div>
          </div>
          <div className="desk:order-1">
            <PicksPanel appointmentId={appointmentId} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
