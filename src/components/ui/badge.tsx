// shadcn/ui (MIT) Badge, in shadcn/ui's form, themed for Nearby. The `sample` variant is the one Sample badge
// every merchant carries (spec 3.11.2: 11 px, uppercase, weight 700, #B4266B on #F7E6EE; REQ-08-05).
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva('inline-flex items-center rounded-full font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'bg-tint px-2.5 py-1 text-xs text-primary',
      sample: 'bg-badge-bg px-2 py-[3px] text-badge font-bold uppercase text-accent-pink',
      outline: 'border border-outline-border px-2.5 py-1 text-xs text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
