// The Shopper seat (F6.3; REQ-05-03, REQ-05-07; design/choose-a-seat.html): one large card, "A shopper's week", its
// sentence, the five appointments as small tiles (day, time in America/Phoenix, title) and "Open the week".
// The card is a plain container holding six separate controls (ruling 34): each tile opens that appointment's Stop
// page, and "Open the week" opens My week (3.11.1). Every control puts the visitor in the Shopper seat and connects the
// demo calendar on the way (idempotent), so a first visit never stops at the Connect screen (AC-REQ-05-03-02).
import { useState } from 'react';
import type * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/hooks/useApi';
import { prefetchPicks } from '@/hooks/usePicksPrefetch';
import type { AppointmentTile, ShopperSeatCard as ShopperSeatCardData, UpcomingAppointmentsResult } from '@/shared/types';
import { formatDayShortTime } from '@/client/format';
import { SHOPPER_SEAT, writeSeat } from '@/hooks/useSeat';
import { cn } from '@/components/ui/cn';

/** Seat, then the demo calendar connected (idempotent). A failure is left to My week, which sends to Connect. */
async function enterShopperSeat(): Promise<void> {
  writeSeat(SHOPPER_SEAT);
  try {
    await api.post('/api/calendar/demo-connection');
  } catch {
    // My week sends the visitor to Connect if the connection still is not there.
  }
}

/**
 * This browser's appointment for a tile. GET /api/seats gives a session's own appointment id once it is connected, and
 * the demo event id before; after connecting, the tile is matched by id, else by its title and start.
 */
export function resolveTile(tile: AppointmentTile, week: UpcomingAppointmentsResult): string | null {
  const byId = week.appointments.find((a) => a.id === tile.appointmentId);
  if (byId) return byId.id;
  const byEvent = week.appointments.find((a) => a.title === tile.title && a.startsAt === tile.startsAt);
  return byEvent ? byEvent.id : null;
}

const control =
  'min-h-touch rounded-tile px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-wait';

export function ShopperSeatCard({ data }: { data: ShopperSeatCardData }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // "Open the week; it opens My week" (3.11.1).
  const openWeek = async (event: React.MouseEvent) => {
    event.preventDefault();
    setBusy(true);
    await enterShopperSeat();
    navigate('/week');
  };

  // A tile opens its own Stop page; the other appointments that are on are prefetched for the week (ruling 32).
  const openStop = async (tile: AppointmentTile) => {
    setBusy(true);
    await enterShopperSeat();
    try {
      const week = await api.get<UpcomingAppointmentsResult>('/api/appointments/upcoming');
      const id = resolveTile(tile, week);
      if (!id) {
        navigate('/week');
        return;
      }
      for (const a of week.appointments) if (a.enabled && a.id !== id) prefetchPicks(a.id);
      navigate(`/appointments/${encodeURIComponent(id)}`);
    } catch {
      navigate('/week');
    }
  };

  return (
    <div
      data-testid="shopper-card"
      className="flex flex-wrap items-center justify-between gap-6 rounded-section bg-primary px-6 py-7 text-background sm:px-8"
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <h3 className="font-display text-[28px] font-bold">A shopper&rsquo;s week</h3>
        <p className="text-on-primary-muted">
          The demo calendar: five appointments around Tucson, Tuesday to Thursday. See the picks for each one and buy in the PayPal sandbox.
        </p>
      </div>
      <div className="grid min-w-0 flex-[1_1_380px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 text-[13px]">
        {data.appointments.map((a) => {
          const when = formatDayShortTime(a.startsAt);
          return (
            <button
              key={a.appointmentId}
              type="button"
              data-testid="appointment-tile"
              disabled={busy}
              onClick={() => void openStop(a)}
              aria-label={`${a.title}, ${when}: open this stop`}
              className={cn(control, 'flex flex-col bg-primary-raised text-background hover:bg-primary-hover')}
            >
              <span className="font-bold">{when}</span>
              <span className="text-on-primary-muted">{a.title}</span>
            </button>
          );
        })}
        <Link
          to="/week"
          onClick={(e) => void openWeek(e)}
          data-testid="open-the-week"
          aria-disabled={busy || undefined}
          className={cn(control, 'flex items-center justify-between bg-background font-bold text-foreground no-underline hover:bg-tint hover:text-foreground')}
        >
          Open the week
          <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
