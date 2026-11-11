// The picks for one appointment (F2.2, F3.1, F3.2; REQ-02-02, REQ-02-03, REQ-03-01, REQ-03-02, REQ-03-07,
// REQ-03-08): up to two pick cards under "Two picks for this stop" / "One pick for this stop" with "Chosen by the
// agent", the no-match message, Yes -> confirm sheet -> Pay with PayPal, and Not now. A declined pick is hidden.
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AcceptProposalResult, AppointmentPicks, Pick, Proposal, StartPaymentResult } from '@/shared/types';
import { NO_MATCH_MESSAGE, PAYMENT_FAILED_MESSAGE } from '@/shared/types';
import { api, isApiError, useApiQuery } from '@/hooks/useApi';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { savePendingPayment } from '@/client/pendingPayment';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ConfirmPurchase } from './ConfirmPurchase';
import { PickCard, PickCardSkeleton } from './PickCard';

/** The label above the cards (spec 3.11.2; ruling 25, RATIFIED, amending ruling 20). */
export const CHOSEN_BY_AGENT_LABEL = 'Chosen by the agent';
export const MATCHED_BY_FALLBACK_LABEL = 'Matched by distance and time';
/** Shown above the placeholder cards while the picks load. */
export const AGENT_CHOOSING_LINE = 'The agent is choosing\u2026';

/** The Not now fade (spec 3.11.2 Motion: 150-200 ms; none under reduced motion, REQ-08-03). */
const LEAVE_MS = 200;

interface PicksPanelProps {
  appointmentId: string;
  /** Leaves the app for PayPal's approval page. Replaceable in tests. */
  redirect?: (url: string) => void;
}

function PlainNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rounded-card border border-border bg-card px-[18px] py-6 text-center text-[17px] font-semibold text-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

export function PicksPanel({ appointmentId, redirect = (url) => window.location.assign(url) }: PicksPanelProps) {
  const picksQuery = useApiQuery<AppointmentPicks>(`/api/appointments/${encodeURIComponent(appointmentId)}/picks`);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AcceptProposalResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const { data, error, loading, reload, setData } = picksQuery;
  const reducedMotion = useReducedMotion();

  const markDeclined = (proposalId: string) =>
    setData((prev) =>
      prev ? { ...prev, picks: prev.picks.map((p) => (p.proposalId === proposalId ? { ...p, status: 'declined' as const } : p)) } : prev,
    );

  // Not now (F3.2; REQ-03-02): the pick fades out and is dismissed for this appointment. Nothing reaches PayPal.
  const onNotNow = async (pick: Pick) => {
    setLeaving((s) => new Set(s).add(pick.proposalId));
    try {
      await api.post<Proposal>(`/api/proposals/${encodeURIComponent(pick.proposalId)}/decline`);
      window.setTimeout(() => markDeclined(pick.proposalId), reducedMotion ? 0 : LEAVE_MS);
      toast('Pick dismissed for this stop.');
    } catch (e) {
      setLeaving((s) => {
        const next = new Set(s);
        next.delete(pick.proposalId);
        return next;
      });
      if (isApiError(e) && e.status === 400) {
        toast('This pick can no longer be dismissed.');
        reload();
      } else {
        toast.error('Could not dismiss this pick. Try again.');
      }
    }
  };

  // Yes (F3.1; REQ-03-01, REQ-03-08): accept, receive the single-use token, open the confirm sheet.
  const onYes = async (pick: Pick) => {
    setBusyId(pick.proposalId);
    try {
      const result = await api.post<AcceptProposalResult>(`/api/proposals/${encodeURIComponent(pick.proposalId)}/accept`);
      setConfirm(result);
      setSheetOpen(true);
    } catch (e) {
      if (isApiError(e) && e.status === 400) {
        toast('This pick is no longer available.');
        reload();
      } else {
        toast.error('Could not open this pick. Try again.');
      }
    } finally {
      setBusyId(null);
    }
  };

  // Pay with PayPal (REQ-03-01, REQ-03-07, REQ-03-08): the amount is never sent; the server reads the stored price.
  const onPay = async () => {
    if (!confirm) return;
    const proposalId = confirm.confirmSheet.proposalId;
    setPaying(true);
    try {
      const result = await api.post<StartPaymentResult>('/api/purchases', {
        proposalId,
        confirmationToken: confirm.confirmationToken,
      });
      savePendingPayment(proposalId, appointmentId);
      redirect(result.payerActionUrl);
    } catch {
      // A refused token (403) or a refused state (400) keeps the pick; the shopper may tap Yes again.
      setPaying(false);
      setSheetOpen(false);
      setConfirm(null);
      toast.error(PAYMENT_FAILED_MESSAGE);
    }
  };

  let body: ReactNode;
  let visible: Pick[] = [];
  if (loading && !data) {
    body = (
      <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Finding picks for this stop">
        {/* One plain line while the agent runs (spec owner's follow-up; ruling 32). */}
        <p className="text-[15px] text-secondary-text" role="status" data-testid="picks-loading-line">
          {AGENT_CHOOSING_LINE}
        </p>
        <PickCardSkeleton />
        <PickCardSkeleton />
      </div>
    );
  } else if (error) {
    body = <ErrorState title="The picks did not load" message="Nearby could not find picks for this stop just now. Try again in a moment." onRetry={reload} />;
  } else if (data) {
    visible = data.picks.filter((p) => p.status !== 'declined');
    if (data.noMatch) {
      body = <PlainNote testId="no-match">{NO_MATCH_MESSAGE}</PlainNote>;
    } else if (data.picks.length === 0) {
      body = <PlainNote testId="picks-off">This appointment is turned off. Turn it on in My week to see picks.</PlainNote>;
    } else if (visible.length === 0) {
      body = <PlainNote testId="picks-none-left">No picks left for this stop.</PlainNote>;
    } else {
      body = (
        <div className="flex flex-col gap-3.5">
          {visible.map((p, i) => (
            <PickCard
              key={p.proposalId}
              pick={p}
              onYes={onYes}
              onNotNow={onNotNow}
              busy={busyId === p.proposalId}
              leaving={leaving.has(p.proposalId)}
              raised={i === 0}
            />
          ))}
        </div>
      );
    }
  }

  const heading = visible.length === 2 ? 'Two picks for this stop' : visible.length === 1 ? 'One pick for this stop' : 'Picks for this stop';
  return (
    <section aria-labelledby="picks-heading" className="flex flex-col">
      <div className="flex items-center justify-between gap-3 pb-2 pt-[18px] desk:pt-0">
        <h2 id="picks-heading" className="font-display text-xl font-bold">
          {heading}
        </h2>
        {visible.length > 0 && (
          // True to the path (ruling 25, RATIFIED): the agent's picks, or the fallback's top two by score.
          <span className="text-[13px] text-secondary-text" data-testid="picks-source-label">
            {visible.every((p) => p.source === 'agent') ? CHOSEN_BY_AGENT_LABEL : MATCHED_BY_FALLBACK_LABEL}
          </span>
        )}
      </div>
      {body}
      {visible.length > 0 && (
        <p className="pt-4 text-center text-[13px] text-secondary-text">Nothing is bought until you tap Yes and approve it on PayPal.</p>
      )}
      <ConfirmPurchase
        sheet={confirm?.confirmSheet ?? null}
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!paying) setSheetOpen(o);
        }}
        onPay={onPay}
        paying={paying}
      />
    </section>
  );
}
