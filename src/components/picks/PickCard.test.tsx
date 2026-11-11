// @vitest-environment jsdom
// Pick card (REQ-02-02, REQ-08-09; spec 3.11.2 The pick card; ruling 3: the score is not drawn).
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Pick } from '@/shared/types';
import { PickCard } from './PickCard';

afterEach(cleanup);

const pick: Pick = {
  proposalId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  merchantId: 'a1b2c3d4-0000-4000-8000-000000000001',
  merchantName: 'Saguaro Bean Co.',
  merchantIsSample: true,
  offerId: 'b2c3d4e5-0000-4000-8000-000000000011',
  offerTitle: 'Any drink plus pastry',
  priceCents: 600,
  regularPriceCents: null,
  validWindow: { validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '07:00', validEndTime: '11:00' },
  reason: 'Saguaro Bean is two blocks from your 9:30 and the deal runs until 11.',
  distanceMeters: 322,
  score: 0.87,
  source: 'agent',
  status: 'proposed',
  purchased: false,
};

describe('PickCard status (AC-REQ-03-12-01)', () => {
  it('a bought pick shows Bought and offers neither Yes nor Not now', () => {
    render(<PickCard pick={{ ...pick, status: 'accepted', purchased: true }} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(screen.getByTestId('pick-status')).toHaveTextContent('Bought');
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^not now/i })).toBeNull();
    cleanup();
  });
  it('an accepted pick says so and keeps Yes, without Not now (declined only from proposed)', () => {
    render(<PickCard pick={{ ...pick, status: 'accepted' }} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(screen.getByTestId('pick-status')).toHaveTextContent('You said yes to this pick');
    expect(screen.getByRole('button', { name: /^yes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^not now/i })).toBeNull();
    cleanup();
  });
  it('a proposed pick has no status line', () => {
    render(<PickCard pick={pick} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(screen.queryByTestId('pick-status')).toBeNull();
    cleanup();
  });
});

describe('PickCard', () => {
  it('shows the merchant with a Sample badge, the offer, the price, the reason, the distance and the valid window', () => {
    render(<PickCard pick={pick} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(screen.getByRole('heading', { name: /Saguaro Bean Co\./ })).toBeInTheDocument();
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(screen.getByText('Any drink plus pastry')).toBeInTheDocument();
    expect(screen.getByTestId('pick-price')).toHaveTextContent('$6.00');
    expect(screen.getByTestId('pick-reason')).toHaveTextContent(`“${pick.reason}”`);
    expect(screen.getByTestId('pick-distance')).toHaveTextContent('0.2 mi');
    expect(screen.getByTestId('pick-window')).toHaveTextContent('Weekdays, 7:00 to 11:00 AM');
  });

  it('draws Yes and Not now 48 px tall, Yes twice as wide', () => {
    render(<PickCard pick={pick} onYes={() => undefined} onNotNow={() => undefined} />);
    const yes = screen.getByRole('button', { name: /^Yes/ });
    const notNow = screen.getByRole('button', { name: /^Not now/ });
    expect(yes).toHaveTextContent('Yes');
    expect(notNow).toHaveTextContent('Not now');
    expect(yes).toHaveClass('h-12', 'flex-[2_1_0%]', 'bg-primary');
    expect(notNow).toHaveClass('h-12', 'flex-[1_1_0%]', 'border-outline-border');
  });

  it('does not draw the score (ruling 3)', () => {
    const { container } = render(<PickCard pick={pick} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(container.textContent).not.toContain('0.87');
    expect(container.textContent).not.toMatch(/score/i);
  });

  it('passes the pick to Yes and Not now', () => {
    const onYes = vi.fn();
    const onNotNow = vi.fn();
    render(<PickCard pick={pick} onYes={onYes} onNotNow={onNotNow} />);
    fireEvent.click(screen.getByRole('button', { name: /^Yes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Not now/ }));
    expect(onYes).toHaveBeenCalledWith(pick);
    expect(onNotNow).toHaveBeenCalledWith(pick);
  });

  it.each([
    [5, '$0.05'],
    [150, '$1.50'],
    [600, '$6.00'],
    [50000, '$500.00'],
  ])('prints %i cents as %s', (cents, text) => {
    render(<PickCard pick={{ ...pick, priceCents: cents }} onYes={() => undefined} onNotNow={() => undefined} />);
    expect(screen.getByTestId('pick-price')).toHaveTextContent(text);
  });
});
