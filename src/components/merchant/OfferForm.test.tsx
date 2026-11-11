// @vitest-environment jsdom
// The New offer form (F4.2; REQ-04-02, REQ-04-03, REQ-08-08; ruling 4): refusals beside the fields with nothing sent,
// dollars to integer cents, and server field errors shown beside their fields.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Offer } from '@/shared/types';
import { OFFER_FORM_MESSAGES } from '@/validators/offerForm';
import { OfferForm } from './OfferForm';

const MID = '00000000-0000-4000-8000-000000000001';

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
beforeEach(() => {
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

function stubPublish(reply: (body: unknown) => { status: number; body: unknown }) {
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const r = reply(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function setup() {
  const onPublished = vi.fn();
  render(<OfferForm merchantId={MID} onPublished={onPublished} onCancel={() => undefined} />);
  return onPublished;
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function chooseCategory(value: string) {
  const native = document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
  fireEvent.change(native, { target: { value } });
}

function fillValid() {
  type('Title', 'Iced oat latte');
  type('Price in dollars', '6.5');
  chooseCategory('coffee');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mon' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wed' }));
  type('Start time', '07:00');
  type('End time', '11:00');
}

describe('OfferForm', () => {
  it('counts the title live', () => {
    setup();
    type('Title', 'Day pass');
    expect(screen.getByText('8/60')).toBeInTheDocument();
  });

  it('refuses a price with three decimals, a 61-character title, no day and a start after the end, beside the fields; nothing is sent', async () => {
    const fetchFn = stubPublish(() => ({ status: 500, body: {} }));
    setup();
    type('Title', 'x'.repeat(61));
    type('Price in dollars', '6.001');
    chooseCategory('coffee');
    type('Start time', '11:00');
    type('End time', '07:00');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByTestId('error-offer-title-error')).toHaveTextContent(OFFER_FORM_MESSAGES.title);
    expect(screen.getByText('61/60')).toBeInTheDocument();
    expect(screen.getByTestId('error-offer-price-error')).toHaveTextContent(OFFER_FORM_MESSAGES.price);
    expect(screen.getByTestId('error-offer-days-error')).toHaveTextContent(OFFER_FORM_MESSAGES.days);
    expect(screen.getByTestId('error-offer-end-error')).toHaveTextContent(OFFER_FORM_MESSAGES.order);
    expect(screen.getByLabelText('Price in dollars')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends integer cents: "6.5" is 650, "8" is 800', async () => {
    let sent: Record<string, unknown> = {};
    const offer: Offer = {
      id: 'o-new',
      merchantId: MID,
      title: 'Iced oat latte',
      priceCents: 650,
      regularPriceCents: 800,
      category: 'coffee',
      isDeposit: false,
      validDays: ['mon', 'wed'],
      validStartTime: '07:00',
      validEndTime: '11:00',
      createdAt: '2026-11-11T18:00:00.000Z',
      updatedAt: '2026-11-11T18:00:00.000Z',
    };
    stubPublish((body) => {
      sent = body as Record<string, unknown>;
      return { status: 201, body: { success: true, data: offer } };
    });
    const onPublished = setup();
    fillValid();
    type(/Regular price in dollars/, '8');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(offer));
    expect(sent).toEqual({
      title: 'Iced oat latte',
      priceCents: 650,
      regularPriceCents: 800,
      category: 'coffee',
      validDays: ['mon', 'wed'],
      validStartTime: '07:00',
      validEndTime: '11:00',
    });
  });

  it('shows the server field errors beside their fields and saves nothing', async () => {
    stubPublish(() => ({
      status: 400,
      body: {
        success: false,
        error: { code: 'validation_error', message: 'The offer breaks a rule. Nothing was saved.', details: { fieldErrors: [{ field: 'title', message: 'Server says no.' }] } },
      },
    }));
    const onPublished = setup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByTestId('error-offer-title-error')).toHaveTextContent('Server says no.');
    expect(onPublished).not.toHaveBeenCalled();
  });
});
