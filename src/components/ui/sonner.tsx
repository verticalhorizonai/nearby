// shadcn/ui (MIT) Sonner toaster, in shadcn/ui's form (package `sonner`), themed for Nearby. The payment result is a
// toast (spec 3.11.2; REQ-08-06). Bottom centre, lifted clear of the bottom controls. Under reduced motion the
// global rule in src/styles/globals.css stops its entrance animation (REQ-08-03).
import type * as React from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      offset={88}
      mobileOffset={88}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-panel border border-border bg-card text-foreground shadow-pick font-sans text-[15px]',
          title: 'font-semibold',
          description: 'text-secondary-text',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-tint text-foreground',
          error: 'text-error',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
