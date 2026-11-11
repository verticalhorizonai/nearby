// shadcn/ui (MIT) `cn` helper, in its own form: clsx + tailwind-merge.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
