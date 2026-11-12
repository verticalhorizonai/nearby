// Signs of life (build ruling 43): what each of a session's agent runs is doing while it is in flight, held in the
// process only (no table). The agent loop reports each real tool call as it starts; GET /api/agent/runs returns this
// session's runs. A run's record is removed when its picks are saved, so nothing outlives the run.
import type { AgentRun, AgentRunMode } from '../../shared/types.js';

/** What a run reports. */
export interface RunReporter {
  /** A tool call is starting. */
  step(tool: string, label: string): void;
  /** The run goes to the fallback without running the model (kill switch, rate limit, no model). */
  fallback(): void;
}

interface Entry {
  sessionId: string;
  run: AgentRun;
}

export class AgentActivity {
  private readonly runs = new Map<string, Entry>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Records that a run for this session's stop has started; the returned `end` removes it. */
  begin(sessionId: string, appointmentId: string): RunReporter & { end(): void } {
    const key = `${sessionId}:${appointmentId}`;
    const entry: Entry = { sessionId, run: { appointmentId, mode: 'agent' as AgentRunMode, startedAt: this.now().toISOString(), steps: [] } };
    this.runs.set(key, entry);
    const live = () => this.runs.get(key) === entry;
    return {
      step: (tool, label) => {
        if (live()) entry.run.steps.push({ tool, label, startedAt: this.now().toISOString() });
      },
      fallback: () => {
        if (live() && entry.run.steps.length === 0) entry.run.mode = 'fallback';
      },
      end: () => {
        if (live()) this.runs.delete(key);
      },
    };
  }

  /** This session's runs in flight, oldest first. Another session's are never included. */
  list(sessionId: string): AgentRun[] {
    const out: AgentRun[] = [];
    for (const e of this.runs.values()) {
      if (e.sessionId === sessionId) out.push({ ...e.run, steps: e.run.steps.map((s) => ({ ...s })) });
    }
    return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}
