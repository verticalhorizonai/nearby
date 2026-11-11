// The current seat, held in the client (build ruling 5: no seat route; REQ-05-03, REQ-05-04). Stored in localStorage
// under `nearby.seat` as a CurrentSeat; every storage access is guarded, so a blocked storage still renders.
import { useCallback, useSyncExternalStore } from 'react';
import type { CurrentSeat } from '@/shared/types';

export const SEAT_STORAGE_KEY = 'nearby.seat';

export const SHOPPER_SEAT: CurrentSeat = { seat: 'shopper', merchantId: null, merchantName: null, merchantIsSample: null };

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSeat: CurrentSeat | null = null;
/** Used only when localStorage throws (private mode, blocked site data): the seat then lasts for this page. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SEAT_STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

function parse(raw: string | null): CurrentSeat | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CurrentSeat>;
    if (v.seat === 'shopper') return SHOPPER_SEAT;
    if (v.seat === 'merchant' && typeof v.merchantId === 'string' && typeof v.merchantName === 'string') {
      return { seat: 'merchant', merchantId: v.merchantId, merchantName: v.merchantName, merchantIsSample: v.merchantIsSample ?? true };
    }
  } catch {
    /* a bad stored value reads as no seat */
  }
  return null;
}

function snapshot(): CurrentSeat | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSeat = parse(raw);
  }
  return cachedSeat;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEAT_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function writeSeat(seat: CurrentSeat): void {
  try {
    window.localStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
  } catch {
    memoryRaw = JSON.stringify(seat);
  }
  listeners.forEach((l) => l());
}

/** The chip text: "Shopper" or "Merchant: {name} (Sample)" (spec 3.11.1; AC-REQ-05-04-02). */
export function seatLabel(seat: CurrentSeat): string {
  if (seat.seat === 'shopper') return 'Shopper';
  return `Merchant: ${seat.merchantName ?? ''}${seat.merchantIsSample ? ' (Sample)' : ''}`;
}

export function useSeat(): { seat: CurrentSeat | null; setSeat: (seat: CurrentSeat) => void } {
  const seat = useSyncExternalStore(subscribe, snapshot, () => null);
  const setSeat = useCallback((s: CurrentSeat) => writeSeat(s), []);
  return { seat, setSeat };
}
