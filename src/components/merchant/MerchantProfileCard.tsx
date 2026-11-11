// The merchant profile card (F4.1 step 3; REQ-04-01, REQ-08-05): name, Sample badge, type, area and its location on a
// small map, with the sample notice (spec 3.11 Merchant dashboard: "Sample banner").
import type { Merchant } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { COLORS } from '@/styles/tokens';
import { MapGround } from '@/components/map/MapMarkers';

export function MerchantProfileCard({ merchant }: { merchant: Merchant }) {
  const { lat, lng } = merchant.location;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-6 rounded-section p-6" data-testid="merchant-profile">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
        <p className="text-label uppercase text-secondary-text">Merchant dashboard</p>
        <h1 className="flex flex-wrap items-center gap-3 font-display text-4xl font-bold leading-tight">
          {merchant.name}
          {merchant.isSample && <Badge variant="sample">Sample</Badge>}
        </h1>
        <p className="text-body-text">
          {merchant.type}, {merchant.area}
        </p>
        {merchant.isSample && (
          <p className="rounded-panel bg-badge-bg px-3 py-2 text-sm font-semibold text-accent-pink">
            Sample merchant. Not a real business; its offers and sales are part of the demo.
          </p>
        )}
      </div>
      <figure className="m-0 flex flex-col items-start gap-1.5">
        <svg viewBox="0 0 160 112" width={160} height={112} className="block overflow-hidden rounded-panel border border-border" role="img" aria-label={`Location of ${merchant.name}, ${merchant.area}`}>
          <MapGround width={160} height={112} />
          <circle cx={80} cy={56} r={18} fill={COLORS.glow} opacity={0.4} />
          <path d="M80 33c-7.2 0-13 5.6-13 12.5 0 9.2 13 23 13 23s13-13.8 13-23c0-6.9-5.8-12.5-13-12.5z" fill={COLORS.accent} />
          <circle cx={80} cy={45.5} r={4.8} fill={COLORS.surface} />
        </svg>
        <figcaption className="text-[13px] text-secondary-text">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </figcaption>
      </figure>
    </Card>
  );
}
