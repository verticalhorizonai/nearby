// Prefetching picks (spec owner's follow-up after acceptance; ruling 32): when My week loads, the picks of every
// appointment that is turned on are requested in the background, so they are usually ready when the shopper opens
// one. The server runs one agent run per appointment and session: a request that arrives while a run is in flight
// waits on that same run (src/services/picks/picksService.ts#picks), so opening an appointment never starts a second.
import { useEffect, useRef } from 'react';
import type { Appointment } from '@/shared/types';
import { api } from './useApi';

/** Starts the picks request for one appointment in the background; errors are left to the appointment page. */
export function prefetchPicks(appointmentId: string): void {
  void api.get(`/api/appointments/${encodeURIComponent(appointmentId)}/picks`).catch(() => undefined);
}

/** Prefetches, once per page visit, the picks of every appointment that is turned on. */
export function usePicksPrefetch(appointments: Appointment[] | undefined): void {
  const done = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of appointments ?? []) {
      if (!a.enabled || done.current.has(a.id)) continue;
      done.current.add(a.id);
      prefetchPicks(a.id);
    }
  }, [appointments]);
}
