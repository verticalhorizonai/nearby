// The Shopper seat (F6.3; REQ-05-03, REQ-05-07; design/choose-a-seat.html): one large card, "A shopper's week", its
// sentence, the five appointments as small tiles (day, time in America/Phoenix, title) and "Open the week". One tap
// puts the visitor in the Shopper seat and opens My week.
import type * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/hooks/useApi';
import type { ShopperSeatCard as ShopperSeatCardData } from '@/shared/types';
import { formatDayShortTime } from '@/client/format';
import { SHOPPER_SEAT, writeSeat } from '@/hooks/useSeat';

export function ShopperSeatCard({ data }: { data: ShopperSeatCardData }) {
  const navigate = useNavigate();
  // "Open the week; it opens My week" (3.11.1): one tap takes the shopper straight in. The demo calendar is connected
  // on the way (idempotent), so a first visit does not stop at the Connect screen (AC-REQ-05-03-02).
  const openWeek = async (event: React.MouseEvent) => {
    event.preventDefault();
    writeSeat(SHOPPER_SEAT);
    try {
      await api.post('/api/calendar/demo-connection');
    } catch {
      // My week sends the visitor to Connect if the connection still is not there.
    }
    navigate('/week');
  };
  return (
    <Link
      to="/week"
      onClick={(e) => void openWeek(e)}
      data-testid="shopper-card"
      className="flex flex-wrap items-center justify-between gap-6 rounded-section bg-primary px-6 py-7 text-background no-underline transition-colors duration-150 hover:bg-primary-hover hover:text-background sm:px-8"
    >
      <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <span className="font-display text-[28px] font-bold">A shopper&rsquo;s week</span>
        <span className="text-on-primary-muted">
          The demo calendar: five appointments around Tucson, Tuesday to Thursday. See the picks for each one and buy in the PayPal sandbox.
        </span>
      </span>
      <span className="grid min-w-0 flex-[1_1_380px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 text-[13px]">
        {data.appointments.map((a) => (
          <span key={a.appointmentId} className="flex flex-col rounded-tile bg-primary-raised px-3 py-2.5" data-testid="appointment-tile">
            <span className="font-bold">{formatDayShortTime(a.startsAt)}</span>
            <span className="text-on-primary-muted">{a.title}</span>
          </span>
        ))}
        <span className="flex min-h-touch items-center justify-between rounded-tile bg-background px-3 py-2.5 font-bold text-foreground">
          Open the week
          <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
