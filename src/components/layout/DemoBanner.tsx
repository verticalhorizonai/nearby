// The demonstration banner: one slim banner at the top of every page, with the spec's full text on every width,
// phones included (spec 3.11.1; build ruling 14; REQ-05-05).
import { DEMONSTRATION_BANNER_TEXT } from '@/shared/types';

export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Demonstration notice"
      className="bg-banner px-4 py-2 text-center text-xs leading-snug text-banner-foreground sm:px-6 sm:text-[13px]"
    >
      {DEMONSTRATION_BANNER_TEXT}
    </div>
  );
}
