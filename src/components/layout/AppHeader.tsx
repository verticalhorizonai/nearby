// The header of an app page (spec 3.11.1, 3.11.2): the mark and name, a chip with the current seat ("Shopper" or
// "Merchant: {name} (Sample)") and "Switch seat", which returns to the Choose a seat page (F6.4; REQ-05-04).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSeat, seatLabel } from '@/hooks/useSeat';
import { Mark } from './Mark';

interface AppHeaderProps {
  /** Shows the seat chip and "Switch seat". Off on the Home and Choose a seat pages. */
  showSeat?: boolean;
  /** Extra controls on the right (e.g. Reset demo on Choose a seat). */
  actions?: ReactNode;
}

export function AppHeader({ showSeat = true, actions }: AppHeaderProps) {
  const { seat } = useSeat();
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="flex min-h-touch shrink-0 items-center gap-2 text-foreground no-underline hover:text-foreground" aria-label="Nearby home">
            <Mark size={26} />
            <span className="font-display text-xl font-bold tracking-[-0.01em]">Nearby</span>
          </Link>
          {showSeat && seat && (
            <span
              data-testid="seat-chip"
              className="truncate rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-primary"
              title={seatLabel(seat)}
            >
              {seatLabel(seat)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {showSeat && (
            <Link
              to="/seats"
              className="flex min-h-touch items-center px-1 text-sm font-semibold text-primary no-underline hover:text-primary-hover"
            >
              Switch seat
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
