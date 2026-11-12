// @vitest-environment jsdom
// View, Edit and Remove on the merchant dashboard (build ruling 44): every offer opens a read-only view with every
// field and whether it is a sample offer or one you posted; an offer this browser posted has Edit (the offer form,
// filled in, saved through the edit route, replacing the row) and Remove (confirmed first); a sample offer has neither.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { MerchantDashboard, MerchantOffer } from '@/shared/types';
import { AppRoutes } from '@/client/App';

const MID = '00000000-0000-4000-8000-000000000001';
const SEED = '00000000-0000-4000-8000-000000000101';
const MINE = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const offer = (id: string, title: string, over: Partial<MerchantOffer> = {}): MerchantOffer => ({
  id, merchantId: MID, title, priceCents: 600, regularPriceCents: null, category: 'coffee', isDeposit: false,
  validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '07:00', validEndTime: '11:00',
  createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z', postedByYou: false, replacesOfferId: null, ...over,
});
const dashboard = (): MerchantDashboard => ({
  merchant: {
    id: MID, name: 'Saguaro Bean Co.', type: 'Coffee shop', area: 'near the university', location: { lat: 32.2335, lng: -110.9515 },
    isSample: true, createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
  },
  offers: [
    offer(MINE, 'Poster latte', { postedByYou: true, priceCents: 300, regularPriceCents: 450, validDays: ['tue', 'wed'], validStartTime: '08:00', validEndTime: '10:30' }),
    offer(SEED, 'Any drink plus pastry', { isDeposit: true }),
  ],
});

type Call = { method: string; path: string; body: unknown };
function serve(extra: (c: Call) => Response | null = () => null) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? 'GET', path: new URL(String(input), 'http://localhost').pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = extra(c);
    if (r) return r;
    if (c.path === `/api/merchants/${MID}/dashboard`) return new Response(JSON.stringify({ success: true, data: dashboard() }));
    if (c.path === `/api/merchants/${MID}/sales-feed`) return new Response(JSON.stringify({ success: true, data: { merchantId: MID, items: [] } }));
    return new Response(JSON.stringify({ success: false, error: { code: 'not_found', message: 'nf' } }), { status: 404 });
  }));
  return calls;
}
const open = () =>
  render(
    <MemoryRouter initialEntries={[`/merchant/${MID}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
      <Toaster />
    </MemoryRouter>,
  );
const row = async (title: string) => (await screen.findAllByTestId('offer-row')).find((r) => r.textContent?.includes(title))!;

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the offers list', () => {
  it('opens a read-only view with every field, saying whether it is a sample offer or one you posted', async () => {
    const calls = serve();
    open();
    fireEvent.click(within(await row('Poster latte')).getByRole('button', { name: 'View Poster latte' }));
    const view = await screen.findByTestId('offer-view');
    const text = (label: string) => within(view).getByText(label).nextElementSibling?.textContent;
    expect(text('Title')).toBe('Poster latte');
    expect(text('Category')).toBe('Coffee');
    expect(text('Price')).toBe('$3.00');
    expect(text('Regular price')).toBe('$4.50');
    expect(text('Deposit')).toBe('No');
    expect(text('Days')).toBe('Tue, Wed');
    expect(text('Hours')).toMatch(/8:00.*10:30 AM/);
    expect(text('Offer')).toBe('Posted by you');
    expect(within(view).queryByRole('textbox')).toBeNull(); // read only
    fireEvent.keyDown(view, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('offer-view')).toBeNull());

    fireEvent.click(within(await row('Any drink plus pastry')).getByRole('button', { name: 'View Any drink plus pastry' }));
    const seed = await screen.findByTestId('offer-view');
    expect(within(seed).getByText('Offer').nextElementSibling).toHaveTextContent('Sample offer');
    expect(within(seed).getByText('Deposit').nextElementSibling).toHaveTextContent('Yes, redeemed in store');
    expect(within(seed).queryByText('Regular price')).toBeNull();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('every row has a visible View button; a sample offer has View and Edit, no Remove; an offer you posted has all three (ruling 45)', async () => {
    serve();
    open();
    const sample = await row('Any drink plus pastry');
    expect(within(sample).getAllByRole('button').map((b) => b.textContent)).toEqual(['View', 'Edit']);
    expect(within(sample).queryByTestId('offer-owner-line')).toBeNull();
    const mine = await row('Poster latte');
    expect(within(mine).getAllByRole('button').map((b) => b.textContent)).toEqual(['View', 'Edit', 'Remove']);
    expect(within(mine).getByTestId('offer-owner-line')).toHaveTextContent(/^Posted by you$/);
    for (const b of within(mine).getAllByRole('button')) expect(b).toHaveClass('min-h-touch', 'focus-visible:ring-2');
  });

  it('the View button opens the view on a sample offer and on a posted one; the title opens it too', async () => {
    serve();
    open();
    fireEvent.click(within(await row('Any drink plus pastry')).getByRole('button', { name: 'View Any drink plus pastry' }));
    expect(within(await screen.findByTestId('offer-view')).getByText('Offer').nextElementSibling).toHaveTextContent('Sample offer');
    fireEvent.keyDown(screen.getByTestId('offer-view'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('offer-view')).toBeNull());
    fireEvent.click(within(await row('Poster latte')).getByRole('button', { name: 'View Poster latte' }));
    expect(within(await screen.findByTestId('offer-view')).getByText('Offer').nextElementSibling).toHaveTextContent('Posted by you');
    fireEvent.keyDown(screen.getByTestId('offer-view'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('offer-view')).toBeNull());
    fireEvent.click(within(await row('Poster latte')).getByTestId('offer-view-open'));
    expect(await screen.findByTestId('offer-view')).toBeInTheDocument();
  });

  it('Edit on a sample offer opens the form filled in, says it makes your own version, and the version replaces the sample row with its plain line', async () => {
    const version = offer('c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', 'My pastry deal', { postedByYou: true, replacesOfferId: SEED, priceCents: 500, isDeposit: false });
    const calls = serve((c) =>
      c.method === 'POST' && c.path === `/api/merchants/${MID}/offers/${SEED}/edit`
        ? new Response(JSON.stringify({ success: true, data: { offer: version, replacedOfferId: SEED, picksWithdrawn: 0 } }), { status: 201 })
        : null,
    );
    open();
    fireEvent.click(within(await row('Any drink plus pastry')).getByRole('button', { name: 'Edit Any drink plus pastry' }));
    const form = await screen.findByTestId('offer-form');
    expect(within(form).getByLabelText('Title')).toHaveValue('Any drink plus pastry');
    expect(within(form).getByTestId('offer-edit-note')).toHaveTextContent('Saving makes your own version, which replaces it in your demo only');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'My pastry deal' } });
    fireEvent.change(within(form).getByLabelText('Price in dollars'), { target: { value: '5.00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Offer updated: My pastry deal/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.path).toBe(`/api/merchants/${MID}/offers/${SEED}/edit`);
    expect(screen.queryByText('Any drink plus pastry')).toBeNull();
    const mine = await row('My pastry deal');
    expect(within(mine).getByTestId('offer-owner-line')).toHaveTextContent('Your version. It replaces the sample offer in your demo only.');
    fireEvent.click(within(mine).getByRole('button', { name: 'View My pastry deal' }));
    expect(within(await screen.findByRole('dialog')).getByText('Your version. It replaces the sample offer in your demo only.')).toBeInTheDocument();
    expect(within(screen.getByTestId('offer-view')).getByText('Offer').nextElementSibling).toHaveTextContent('Your version of a sample offer');
  });

  it('Remove asks first, then removes the offer from the list', async () => {
    const calls = serve((c) =>
      c.method === 'POST' && c.path === `/api/merchants/${MID}/offers/${MINE}/remove`
        ? new Response(JSON.stringify({ success: true, data: { offerId: MINE, picksWithdrawn: 1 } }))
        : null,
    );
    open();
    fireEvent.click(within(await row('Poster latte')).getByRole('button', { name: 'Remove Poster latte' }));
    expect(await screen.findByText('Remove this offer?')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false); // nothing until confirmed
    fireEvent.click(screen.getByTestId('offer-remove-confirm'));
    await waitFor(() => expect(screen.getAllByTestId('offer-row')).toHaveLength(1));
    expect(screen.getAllByTestId('offer-row')[0]).toHaveTextContent('Any drink plus pastry');
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([`/api/merchants/${MID}/offers/${MINE}/remove`]);
  });

  it('Edit opens the offer form filled in; saving goes through the edit route and the new offer replaces the old row', async () => {
    const edited = offer('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Poster flat white', { postedByYou: true, priceCents: 450, validDays: ['tue', 'wed'], validStartTime: '08:00', validEndTime: '10:30' });
    const calls = serve((c) =>
      c.method === 'POST' && c.path === `/api/merchants/${MID}/offers/${MINE}/edit`
        ? new Response(JSON.stringify({ success: true, data: { offer: edited, replacedOfferId: MINE, picksWithdrawn: 0 } }), { status: 201 })
        : null,
    );
    open();
    fireEvent.click(within(await row('Poster latte')).getByRole('button', { name: 'Edit Poster latte' }));
    const form = await screen.findByTestId('offer-form');
    expect(within(form).getByRole('heading', { name: 'Edit offer' })).toBeInTheDocument();
    expect(within(form).getByLabelText('Title')).toHaveValue('Poster latte');
    expect(within(form).getByLabelText('Price in dollars')).toHaveValue('3.00');
    expect(within(form).getByLabelText(/Regular price/)).toHaveValue('4.50');
    expect(within(form).getByRole('checkbox', { name: 'Tue' })).toBeChecked();
    expect(within(form).getByRole('checkbox', { name: 'Mon' })).not.toBeChecked();
    expect(within(form).getByLabelText('Start time')).toHaveValue('08:00');

    // The same validation as New offer: an empty title is refused beside the field and nothing is sent.
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByTestId('error-offer-title-error')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Poster flat white' } });
    fireEvent.change(within(form).getByLabelText('Price in dollars'), { target: { value: '4.50' } });
    fireEvent.change(within(form).getByLabelText(/Regular price/), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Offer updated: Poster flat white/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe(`/api/merchants/${MID}/offers/${MINE}/edit`);
    expect(post.body).toEqual({
      title: 'Poster flat white', priceCents: 450, regularPriceCents: null, category: 'coffee',
      validDays: ['tue', 'wed'], validStartTime: '08:00', validEndTime: '10:30',
    });
    const rows = screen.getAllByTestId('offer-row');
    expect(rows.map((r) => r.textContent?.includes('Poster flat white'))).toEqual([true, false]);
    expect(screen.queryByText('Poster latte')).toBeNull();
  });
});
