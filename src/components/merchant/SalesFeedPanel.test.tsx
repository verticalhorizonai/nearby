// @vitest-environment jsdom
// The live sales feed (F5.1; REQ-04-04, REQ-04-05): a skeleton before the first poll, the empty state, then a new
// sale arrives at the top, highlighted, and the highlight ends after its time. Timings are shortened for the test;
// the defaults are SALES_FEED_POLL_INTERVAL_MS and SALES_FEED_NEW_SALE_HIGHLIGHT_MS.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { SalesFeedItem } from '@/shared/types';
import { SalesFeedPanel } from './SalesFeedPanel';

const MID = '00000000-0000-4000-8000-000000000001';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const older: SalesFeedItem = { purchaseId: 'u-1', offerTitle: 'Day pass', amountCents: 1500, completedAt: '2026-11-17T16:00:00.000Z', redemptionCode: 'K7M3QX' };
const newer: SalesFeedItem = { purchaseId: 'u-2', offerTitle: 'Any drink plus pastry', amountCents: 600, completedAt: '2026-11-17T16:45:00.000Z', redemptionCode: 'HX4P2N' };

function stubPolls(pages: SalesFeedItem[][]) {
  let n = 0;
  const fn = vi.fn(async () => {
    const items = pages[Math.min(n, pages.length - 1)];
    n += 1;
    return new Response(JSON.stringify({ success: true, data: { merchantId: MID, items } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('SalesFeedPanel', () => {
  it('shows the empty state when there are no sales', async () => {
    stubPolls([[]]);
    render(<SalesFeedPanel merchantId={MID} intervalMs={10_000} />);
    expect(screen.getByTestId('sales-skeleton')).toBeInTheDocument();
    expect(await screen.findByTestId('sales-empty')).toHaveTextContent(
      'No sales yet. Buy as the shopper and the sale appears here within a few seconds.',
    );
  });

  it('a new sale appears at the top, highlighted, with item, amount, time and code; the highlight ends', async () => {
    const fetchFn = stubPolls([[older], [newer, older]]);
    render(<SalesFeedPanel merchantId={MID} intervalMs={40} highlightMs={250} />);
    const first = await screen.findAllByTestId('sale');
    expect(first).toHaveLength(1);
    expect(first[0]).toHaveAttribute('data-highlighted', 'false');

    await waitFor(() => expect(screen.getAllByTestId('sale')).toHaveLength(2));
    const [top, second] = screen.getAllByTestId('sale');
    expect(top).toHaveTextContent('Any drink plus pastry');
    expect(top).toHaveTextContent('$6.00');
    expect(top).toHaveTextContent('Tue 9:45 AM');
    expect(top).toHaveTextContent('HX4P2N');
    expect(top).toHaveAttribute('data-highlighted', 'true');
    expect(top).toHaveTextContent('New sale');
    expect(second).toHaveAttribute('data-highlighted', 'false');
    expect(fetchFn).toHaveBeenCalledWith(`/api/merchants/${MID}/sales-feed`, expect.objectContaining({ method: 'GET' }));

    await waitFor(() => expect(screen.getAllByTestId('sale')[0]).toHaveAttribute('data-highlighted', 'false'), { timeout: 2000 });
  });
});
