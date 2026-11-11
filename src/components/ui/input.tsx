// shadcn/ui (MIT) Input, in shadcn/ui's form, themed for Nearby (REQ-08-09: 44 px tall).
import * as React from 'react';
import { cn } from './cn';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex min-h-touch w-full rounded-tile border border-outline-border bg-card px-3 py-2 text-base text-foreground placeholder:text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-error',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
