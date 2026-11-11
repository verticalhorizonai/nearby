// @vitest-environment jsdom
// The sales feed polls at a fixed 3000 ms rate: response time does not stretch it (PERF-04-04-01).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSalesFeed } from './useSalesFeed';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSalesFeed', () => {
  it('starts a poll every 3000 ms even when each response takes 150 ms', async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    vi.stubGlobal('fetch', vi.fn(() => {
      starts.push(Date.now());
      return new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify({ success: true, data: { merchantId: 'm', items: [] } }), { status: 200, headers: { 'content-type': 'application/json' } })), 150));
    }));
    renderHook(() => useSalesFeed('m'));
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(3000);
    const deltas = starts.slice(1).map((t, i) => t - starts[i]);
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    for (const d of deltas) expect(d).toBe(3000);
  });
});
