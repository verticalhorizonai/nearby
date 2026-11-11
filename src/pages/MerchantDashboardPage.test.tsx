// @vitest-environment jsdom
// Merchant dashboard (F4.1, F4.2, F5.1; REQ-04-01, REQ-04-02, REQ-05-04): the seat chip names the merchant, the
// profile and offers newest first; a published offer appears at the top at once with a toast.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { MerchantDashboard, Offer } from '@/shared/types';
import { DEMONSTRATION_BANNER_TEXT } from '@/shared/types';
import { AppRoutes } from '@/client/App';

const MID = '00000000-0000-4000-8000-000000000001';
const offer = (id: string, title: string, priceCents: number): Offer => ({
  id,
  merchantId: MID,
  title,
  priceCents,
  regularPriceCents: null,
  category: 'coffee',
  isDeposit: false,
  validDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  validStartTime: '07:00',
  validEndTime: '11:00',
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
});

const dashboard: MerchantDashboard = {
  merchant: {
    id: MID,
    name: 'Saguaro Bean Co.',
    type: 'Coffee shop',
    area: 'near the university',
    location: { lat: 32.2335, lng: -110.9515 },
    isSample: true,
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
  },
  offers: [offer('o-1', 'Any drink plus pastry', 600)],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MerchantDashboardPage', () => {
  it('names the merchant in the seat chip, shows the profile and offers, and adds a published offer at the top', async () => {
    const published = offer('o-2', 'Iced oat latte', 650);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        const method = init?.method ?? 'GET';
        if (method === 'GET' && path === `/api/merchants/${MID}/dashboard`) return new Response(JSON.stringify({ success: true, data: dashboard }));
        if (method === 'GET' && path === `/api/merchants/${MID}/sales-feed`)
          return new Response(JSON.stringify({ success: true, data: { merchantId: MID, items: [] } }));
        if (method === 'POST' && path === `/api/merchants/${MID}/offers`) return new Response(JSON.stringify({ success: true, data: published }), { status: 201 });
        return new Response(JSON.stringify({ success: false, error: { code: 'not_found', message: 'nf' } }), { status: 404 });
      }),
    );
    render(
      <MemoryRouter initialEntries={[`/merchant/${MID}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
        <Toaster />
      </MemoryRouter>,
    );
    expect(screen.getByText(DEMONSTRATION_BANNER_TEXT)).toBeInTheDocument();
    const profile = await screen.findByTestId('merchant-profile');
    expect(within(profile).getByRole('heading', { level: 1 })).toHaveTextContent('Saguaro Bean Co.');
    expect(profile).toHaveTextContent('Coffee shop, near the university');
    expect(await screen.findByTestId('seat-chip')).toHaveTextContent('Merchant: Saguaro Bean Co. (Sample)');
    expect(screen.getAllByTestId('offer-row')).toHaveLength(1);
    expect(await screen.findByTestId('sales-empty')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New offer' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Iced oat latte' } });
    fireEvent.change(screen.getByLabelText('Price in dollars'), { target: { value: '6.50' } });
    fireEvent.change(document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement, { target: { value: 'coffee' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tue' }));
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '07:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText(/Offer published: Iced oat latte/)).toBeInTheDocument();
    const rows = screen.getAllByTestId('offer-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Iced oat latte');
    expect(rows[0]).toHaveTextContent('$6.50');
    expect(screen.queryByTestId('offer-form')).not.toBeInTheDocument();
  });
});
