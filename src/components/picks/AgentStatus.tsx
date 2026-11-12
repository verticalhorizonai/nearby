// Signs of life (build ruling 43): the agent's run shown live. On a My week card, the run's current step with an
// activity dot while it is in flight (on the address line), then what it came to ("2 picks", "1 pick", "Nothing fits") as
// a pill beside the bought pill. On the stop page, the run's steps in order, in place of "The agent is choosing…". Only real tool
// calls are shown; a run that goes straight to the fallback has no steps and reads "Matched by distance and time".
// The dot does not pulse under reduced motion (REQ-08-03).
import { Check } from 'lucide-react';
import type { AgentRun, AppointmentPicks } from '@/shared/types';
import { NO_MATCH_MESSAGE } from '@/shared/types';
import { cn } from '@/components/ui/cn';
import { MATCHED_BY_FALLBACK_LABEL } from './PicksPanel';

/** Shown before the first tool call starts. */
export const RUN_STARTING_LABEL = 'Starting';
export const NOTHING_FITS_LABEL = 'Nothing fits';

/** What a finished run came to, for the card: null when there is nothing to say (off, or every pick passed on). */
export function settledLabel(result: AppointmentPicks | undefined): string | null {
  if (!result) return null;
  if (result.noMatch) return NOTHING_FITS_LABEL;
  const n = result.picks.filter((p) => p.status !== 'declined').length;
  if (n === 0) return null;
  return n === 1 ? '1 pick' : `${n} picks`;
}

/** The current step of a run in flight. */
export function liveLabel(run: AgentRun): string {
  if (run.mode === 'fallback') return MATCHED_BY_FALLBACK_LABEL;
  return run.steps.at(-1)?.label ?? RUN_STARTING_LABEL;
}

/** Consecutive repeats are one line ("Choosing" for each of two saves reads once). */
export function displaySteps(run: AgentRun): string[] {
  const out: string[] = [];
  for (const s of run.steps) if (out.at(-1) !== s.label) out.push(s.label);
  return out;
}

export function ActivityDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="activity-dot"
      className={cn('inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary animate-pulse motion-reduce:animate-none', className)}
    />
  );
}

/**
 * A My week card's live step, in place of the address line while the run is in flight: the same 14 px line, so the
 * card keeps its height, and the card's widest line, so the step reads in full at 375 px.
 */
export function LiveStep({ run }: { run: AgentRun }) {
  return (
    <span data-testid="run-live" className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-primary">
      {run.mode === 'agent' && <ActivityDot />}
      <span className="truncate">{liveLabel(run)}</span>
    </span>
  );
}

/** What the run came to, as a pill beside the bought pill on the title's line: short, so it never wraps. */
export function SettledChip({ result }: { result: AppointmentPicks | undefined }) {
  const settled = settledLabel(result);
  if (!settled) return null;
  return (
    <span data-testid="run-chip" className="flex-none whitespace-nowrap rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold leading-4 text-secondary-text">
      {settled}
      {settled === NOTHING_FITS_LABEL && <span className="sr-only"> ({NO_MATCH_MESSAGE})</span>}
    </span>
  );
}

/** The stop page's live steps, in order, with the current one marked; announced politely, once per step. */
export function RunSteps({ run }: { run: AgentRun }) {
  if (run.mode === 'fallback') {
    return (
      <p className="text-[15px] text-secondary-text" role="status" data-testid="run-fallback-line">
        {MATCHED_BY_FALLBACK_LABEL}
      </p>
    );
  }
  const steps = displaySteps(run);
  return (
    <div data-testid="run-steps">
      <ol aria-hidden="true" className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
        {steps.map((label, i) => {
          const current = i === steps.length - 1;
          return (
            <li key={`${i}-${label}`} data-testid="run-step" data-current={current || undefined} className={cn('flex items-center gap-2', current ? 'font-semibold text-foreground' : 'text-secondary-text')}>
              {current ? <ActivityDot className="mx-[3px]" /> : <Check className="h-3 w-3 flex-none" strokeWidth={2.6} />}
              {label}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite" data-testid="run-announce">
        {steps.at(-1) ?? ''}
      </p>
    </div>
  );
}
