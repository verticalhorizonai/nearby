// Every page's frame: the demonstration banner on top (spec 3.11.1; ruling 14), a header, then the page.
// A shopper page puts the visitor in the Shopper seat when no seat, or another seat, is held (REQ-05-03, REQ-05-04).
import { useEffect, type ReactNode } from 'react';
import { SHOPPER_SEAT, useSeat } from '@/hooks/useSeat';
import { cn } from '@/components/ui/cn';
import { DemoBanner } from './DemoBanner';
import { AppHeader } from './AppHeader';

interface PageShellProps {
  children: ReactNode;
  /** 'shopper' pages set the Shopper seat; 'merchant' pages keep the merchant seat; 'public' shows no seat chip. */
  side?: 'shopper' | 'merchant' | 'public';
  headerActions?: ReactNode;
  /** Replaces the app header (the Home and Choose a seat pages have their own, per their reference designs). */
  header?: ReactNode;
  /** Classes for <main>. The default is the 1120 px column with 32 px side padding (16 px on a phone). */
  mainClassName?: string;
  /** Full-width <main>: the page lays out its own columns (Home). */
  bare?: boolean;
}

export function PageShell({ children, side = 'shopper', headerActions, header, mainClassName, bare = false }: PageShellProps) {
  const { seat, setSeat } = useSeat();

  useEffect(() => {
    if (side === 'shopper' && seat?.seat !== 'shopper') setSeat(SHOPPER_SEAT);
  }, [side, seat, setSeat]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DemoBanner />
      {header ?? <AppHeader showSeat={side !== 'public'} actions={headerActions} />}
      <main className={cn(bare ? 'w-full flex-1' : 'mx-auto w-full max-w-content flex-1 px-4 pb-16 pt-4 sm:px-8', mainClassName)}>
        {children}
      </main>
    </div>
  );
}
