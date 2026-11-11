// The header of the Home and Choose a seat pages (design/home.html, design/choose-a-seat.html; spec 3.11.1): the
// mark and the name "Nearby" in Bricolage Grotesque at 24 px, with the page's own controls on the right.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from './Mark';

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header>
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-[22px] sm:px-8">
        <Link to="/" className="flex min-h-touch items-center gap-2.5 text-foreground no-underline hover:text-foreground" aria-label="Nearby home">
          <Mark size={30} />
          <span className="font-display text-2xl font-bold tracking-[-0.01em]">Nearby</span>
        </Link>
        {children && <div className="flex flex-wrap items-center gap-x-7 gap-y-2">{children}</div>}
      </div>
    </header>
  );
}
