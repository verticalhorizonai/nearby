// The Nearby mark (spec 3.11.2 The mark): a #1F5C45 disc holding a light map pin whose dot is the accent colour.
// Drawn for Nearby as an inline SVG; the same drawing is public/favicon.svg.
import { COLORS } from '@/styles/tokens';
interface MarkProps {
  size?: number;
  className?: string;
}

export function Mark({ size = 30, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false" className={className}>
      <circle cx="15" cy="15" r="15" fill={COLORS.primary} />
      <path d="M15 7.5c-3 0-5.4 2.3-5.4 5.2 0 3.8 5.4 9.6 5.4 9.6s5.4-5.8 5.4-9.6c0-2.9-2.4-5.2-5.4-5.2z" fill={COLORS.page} />
      <circle cx="15" cy="12.8" r="2.1" fill={COLORS.accent} />
    </svg>
  );
}
