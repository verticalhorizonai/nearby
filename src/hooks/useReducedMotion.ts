// True when the visitor's system asks for reduced motion (spec 3.11.2 Motion; REQ-08-03).
import { useMediaQuery } from './useMediaQuery';

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
