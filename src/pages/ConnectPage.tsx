// Connect (F1.1; REQ-01-01): "Use the demo calendar", then the connected calendar's name and the count of upcoming
// appointments, and a button to My week. `GET /api/calendar/connection` (404 when not connected) picks the state.
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CalendarConnection } from '@/shared/types';
import { PageShell } from '@/components/layout/PageShell';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, useApiQuery } from '@/hooks/useApi';

function appointmentsText(n: number): string {
  return n === 1 ? '1 upcoming appointment with an address' : `${n} upcoming appointments with an address`;
}

export function ConnectPage() {
  const connection = useApiQuery<CalendarConnection>('/api/calendar/connection');
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);

  const notConnected = connection.error?.status === 404;
  const connected = connection.data;

  const connect = async () => {
    setConnecting(true);
    setConnectFailed(false);
    try {
      const c = await api.post<CalendarConnection>('/api/calendar/demo-connection');
      connection.setData(() => c);
    } catch {
      setConnectFailed(true);
    } finally {
      setConnecting(false);
    }
  };

  let body;
  if (connection.loading && !connected) {
    body = (
      <Card className="flex flex-col gap-4 rounded-section p-6" aria-busy="true" aria-label="Checking your calendar">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-12 w-48 rounded-full" />
      </Card>
    );
  } else if (connected) {
    body = (
      <Card className="flex flex-col gap-4 rounded-section p-6" data-testid="connected">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-tint text-primary">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-label uppercase text-secondary-text">Connected</p>
            <h2 className="font-display text-2xl font-bold">{connected.calendarName}</h2>
          </div>
        </div>
        <p className="text-body-text">{appointmentsText(connected.upcomingAppointmentCount)} in the next 7 days. Read only.</p>
        <Button asChild size="lg" className="self-start no-underline hover:text-primary-foreground">
          <Link to="/week" className="text-primary-foreground">
            Open my week
          </Link>
        </Button>
      </Card>
    );
  } else if (notConnected) {
    body = (
      <Card className="flex flex-col gap-4 rounded-section p-6">
        <h2 className="font-display text-2xl font-bold">Use the demo calendar</h2>
        <p className="text-body-text">
          The demo calendar holds a week of sample appointments around Tucson. Nearby reads only each event&rsquo;s time and place, never
          descriptions or attendees.
        </p>
        <Button type="button" size="lg" className="self-start" onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Use the demo calendar'}
        </Button>
        {connectFailed && (
          <p role="alert" className="text-sm text-error">
            The demo calendar did not connect. Try again in a moment.
          </p>
        )}
      </Card>
    );
  } else {
    body = <ErrorState title="Your calendar did not load" onRetry={connection.reload} />;
  }

  return (
    <PageShell side="shopper" mainClassName="pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-label uppercase text-secondary-text">Step 1</p>
          <h1 className="font-display text-4xl font-bold leading-tight">Connect a calendar</h1>
          <p className="text-lg text-body-text">Nearby looks at where your week takes you and finds one or two offers that fit each stop.</p>
        </div>
        {body}
      </div>
    </PageShell>
  );
}
