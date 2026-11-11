// shadcn/ui (MIT) Skeleton, in shadcn/ui's form (spec 3.11.2: loading states are skeletons).
import * as React from 'react';
import { cn } from './cn';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-tile bg-tint motion-reduce:animate-none', className)} {...props} />;
}

export { Skeleton };
