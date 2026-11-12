// Prefetching picks (spec owner's follow-up after acceptance; ruling 32): when My week loads, the picks of every
// appointment that is turned on are requested in the background, so they are usually ready when the shopper opens
// one. The server runs one agent run per appointment and session: a request that arrives while a run is in flight
// waits on that same run (src/services/picks/picksService.ts#picks), so opening an appointment never starts a second.
// Each answer is kept, so My week can show what each run came to (build ruling 43).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appointment, AppointmentPicks } from '@/shared/types';
import { api } from './useApi';

/** Starts the picks request for one appointment in the background; errors are left to the appointment page. */
export function prefetchPicks(appointmentId: string): Promise<AppointmentPicks | null> {
  return api.get<AppointmentPicks>(`/api/appointments/${encodeURIComponent(appointmentId)}/picks`).catch(() => null);
}

export interface PicksPrefetch {
  /** The picks each prefetched appointment came to. */
  results: Record<string, AppointmentPicks>;
  /** True while any prefetch is waiting for its answer. */
  pending: boolean;
  /** Prefetches one appointment again (e.g. turned back on). */
  prefetch: (appointmentId: string) => void;
}

/** Prefetches, once per page visit, the picks of every appointment that is turned on. */
export function usePicksPrefetch(appointments: Appointment[] | undefined): PicksPrefetch {
  const done = useRef<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, AppointmentPicks>>({});
  const [waiting, setWaiting] = useState(0);

  const prefetch = useCallback((appointmentId: string) => {
    setWaiting((n) => n + 1);
    void prefetchPicks(appointmentId).then((r) => {
      if (r) setResults((prev) => ({ ...prev, [appointmentId]: r }));
      setWaiting((n) => n - 1);
    });
  }, []);

  useEffect(() => {
    for (const a of appointments ?? []) {
      if (!a.enabled || done.current.has(a.id)) continue;
      done.current.add(a.id);
      prefetch(a.id);
    }
  }, [appointments, prefetch]);

  return { results, pending: waiting > 0, prefetch };
}
