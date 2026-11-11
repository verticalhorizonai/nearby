// @vitest-environment jsdom
// Return from PayPal (REQ-03-01, REQ-03-10, REQ-03-11, REQ-08-06): the receipt on a completed capture; on a failed one
// the exact failure toast and the way back to the pick. The return route is called once, even under StrictMode.
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { PaymentReturnResult } from '@/shared/types';
import { DEMONSTRATION_BANNER_TEXT, PAYMENT_FAILED_MESSAGE } from '@/shared/types';
import { PaymentResultPage } from './PaymentResultPage';

const PID = '8d2f6c1e-3b0a-4f6e-9a57-2f1c0d9e4b11';
const APPT = '4a7e2b90-1c3d-4e5f-8a6b-7c8d9e0f1a2b';

function stubOutcome(path: string, data: PaymentReturnResult) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === path && init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: false, error: { code: 'not_found', message: 'nf' } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function AppointmentStub() {
  const { appointmentId } = useParams();
  return <p data-testid="back-on-pick">{appointmentId}</p>;
}

function renderAt(url: string, kind: 'return' | 'cancel') {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path={`/pay/${kind}`} element={<PaymentResultPage kind={kind} />} />
          <Route path="/appointments/:appointmentId" element={<AppointmentStub />} />
          <Route path="/week" element={<p data-testid="week">week</p>} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaymentResultPage', () => {
  it('shows the receipt on a completed capture, with the banner, and calls the return route once', async () => {
    const fetchFn = stubOutcome(`/api/pay/return/${PID}`, {
      outcome: 'completed',
      proposalId: PID,
      receipt: {
        purchaseId: 'u-1',
        merchantName: 'Fourth Ave Noodle Bar',
        merchantIsSample: true,
        offerTitle: 'Lunch bowl deposit',
        amountCents: 150,
        redemptionCode: 'K7M3QX',
        isDeposit: true,
        completedAt: '2026-11-17T19:12:31.000Z',
      },
    });
    renderAt(`/pay/return?proposalId=${PID}`, 'return');
    expect(screen.getByText(DEMONSTRATION_BANNER_TEXT)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Paid' })).toBeInTheDocument();
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('$1.50');
    const code = screen.getByTestId('redemption-code');
    expect(code).toHaveTextContent('K7M3QX');
    expect(code).toHaveClass('font-mono', 'text-code');
    expect(screen.getByTestId('deposit-note')).toHaveTextContent('Redeem in store.');
    expect(screen.getByText('Fourth Ave Noodle Bar')).toBeInTheDocument();
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(await screen.findByText(/Your code is K7M3QX\./)).toBeInTheDocument();
    const returnCalls = fetchFn.mock.calls.filter(([u]) => String(u).startsWith('/api/pay/return/'));
    expect(returnCalls).toHaveLength(1);
  });

  it('on a failed capture shows the exact failure message and returns to the pick', async () => {
    window.sessionStorage.setItem(`nearby.pending.${PID}`, APPT);
    stubOutcome(`/api/pay/return/${PID}`, { outcome: 'failed', proposalId: PID, message: PAYMENT_FAILED_MESSAGE });
    renderAt(`/pay/return?proposalId=${PID}`, 'return');
    expect(await screen.findByText('Payment did not go through. Nothing was charged.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('back-on-pick')).toHaveTextContent(APPT));
    expect(window.sessionStorage.getItem(`nearby.pending.${PID}`)).toBeNull();
  });

  it('on a cancel with no remembered appointment goes to My week', async () => {
    stubOutcome(`/api/pay/cancel/${PID}`, { outcome: 'failed', proposalId: PID, message: PAYMENT_FAILED_MESSAGE });
    renderAt(`/pay/cancel?proposalId=${PID}`, 'cancel');
    expect(await screen.findByText(PAYMENT_FAILED_MESSAGE)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('week')).toBeInTheDocument());
  });
});
