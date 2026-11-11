// Remembers which appointment a payment started from, so a failed or cancelled return lands back on that pick
// (spec 3.7.4 Cancel; REQ-03-10). Kept in sessionStorage under `nearby.pending.<proposalId>`; every access is guarded.

const PREFIX = 'nearby.pending.';

export function savePendingPayment(proposalId: string, appointmentId: string): void {
  try {
    window.sessionStorage.setItem(PREFIX + proposalId, appointmentId);
  } catch {
    /* storage blocked: the return page falls back to My week */
  }
}

export function readPendingPayment(proposalId: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + proposalId);
  } catch {
    return null;
  }
}

export function clearPendingPayment(proposalId: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + proposalId);
  } catch {
    /* nothing to clear */
  }
}
