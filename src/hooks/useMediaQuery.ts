// Subscribe to a CSS media query (REQ-08-01: the 900 px breakpoint picks Sheet or Dialog for the confirm sheet).
import { useSyncExternalStore } from 'react';

function getMql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = getMql(query);
      if (!mql) return () => undefined;
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => getMql(query)?.matches ?? false,
    () => false,
  );
}

/** From 900 px wide the list sits left and the map right; the confirm sheet becomes a Dialog (spec 3.11.2). */
export const DESKTOP_QUERY = '(min-width: 900px)';
