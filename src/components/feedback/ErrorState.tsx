// A calm error panel shown when a fetch fails (task 207). Plain words, sentence case, no exclamation marks
// (spec 3.11.2 Words). The technical message stays out of the shopper's way.
import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra actions, e.g. a link back to My week. */
  children?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'This did not load',
  message = 'Something went wrong on our side. Your data is safe. Try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  children,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-section border border-border bg-card p-6', className)}>
      <div className="flex items-center gap-2 text-error">
        <CircleAlert className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-body-text">{message}</p>
      {(onRetry || children) && (
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <Button type="button" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
