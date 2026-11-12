// Signs of life (build ruling 43): this session's agent runs in flight, from GET /api/agent/runs. It asks once when the
// page opens (a run may already be in flight), then again every AGENT_RUNS_POLL_MS only while something is in flight:
// while the page itself waits for picks, or while the last answer still listed a run. Then it stops.
import { useEffect, useState } from 'react';
import type { AgentRun, AgentRunsResult } from '@/shared/types';
import { AGENT_RUNS_POLL_MS } from '@/shared/types';
import { api } from './useApi';

export function useAgentRuns(waiting: boolean, intervalMs: number = AGENT_RUNS_POLL_MS): Record<string, AgentRun> {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [checked, setChecked] = useState(false);
  const [tick, setTick] = useState(0);
  const active = waiting || !checked || runs.length > 0;

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const timer = window.setTimeout(
      () => {
        api
          .get<AgentRunsResult>('/api/agent/runs')
          .then((r) => {
            if (stop) return;
            setRuns(r.runs);
          })
          .catch(() => {
            if (!stop) setRuns([]);
          })
          .finally(() => {
            if (stop) return;
            setChecked(true);
            setTick((n) => n + 1);
          });
      },
      checked ? intervalMs : 0,
    );
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [active, checked, intervalMs, tick]);

  const byId: Record<string, AgentRun> = {};
  for (const r of runs) byId[r.appointmentId] = r;
  return byId;
}
