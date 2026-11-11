// The hero drawing (spec 3.11.2 The hero drawing; design/home.html): no photograph, an inline SVG in the palette, drawn
// for Nearby. A simplified street map on #E3ECE4 with pale blocks, three appointment pins joined by a dotted route,
// grey dots for other places and one accent offer pin with the yellow glow beside the first stop; a sample pick
// card is laid over its lower edge. No stock or third-party image.
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/styles/tokens';

const BLOCKS: [number, number, number, number][] = [
  [18, 18, 118, 84],
  [154, 18, 150, 84],
  [322, 18, 180, 84],
  [18, 120, 118, 110],
  [154, 120, 150, 110],
  [322, 120, 86, 110],
  [426, 120, 76, 110],
  [18, 248, 204, 134],
  [240, 248, 168, 134],
  [426, 248, 76, 134],
];

const PLACES: [number, number][] = [
  [92, 60],
  [232, 74],
  [446, 52],
  [74, 196],
  [270, 152],
  [464, 186],
  [330, 322],
  [150, 340],
  [468, 330],
];

export function HeroDrawing() {
  return (
    <div className="relative min-w-0 flex-[1_1_460px] pb-[54px]" data-testid="hero-drawing">
      <svg
        viewBox="0 0 520 400"
        className="block h-auto w-full rounded-hero"
        role="img"
        aria-label="A simplified street map with three appointments along a route and one offer highlighted beside the first stop"
      >
        <rect width="520" height="400" fill={COLORS.tint} />
        <g fill={COLORS.mapBlock}>
          {BLOCKS.map(([x, y, w, h]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={8} />
          ))}
        </g>
        <rect x="336" y="134" width="58" height="82" rx="6" fill={COLORS.mapPark} />
        <g fill={COLORS.placeDotLight}>
          {PLACES.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} />
          ))}
        </g>
        <path
          d="M112 110 H313 V239 H417 V312"
          fill="none"
          stroke={COLORS.primary}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 9"
        />
        <circle cx="190" cy="150" r="40" fill={COLORS.glow} opacity={0.32} />
        <circle cx="190" cy="150" r="22" fill={COLORS.glow} opacity={0.5} />
        <path d="M190 128c-8 0-14.5 6.2-14.5 13.9 0 10.2 14.5 25.6 14.5 25.6s14.5-15.4 14.5-25.6c0-7.7-6.5-13.9-14.5-13.9z" fill={COLORS.accent} />
        <circle cx="190" cy="142" r="5.4" fill={COLORS.surface} />
        <circle cx="112" cy="110" r="15" fill={COLORS.primary} />
        <circle cx="112" cy="110" r="5.5" fill={COLORS.surface} />
        <rect x="34" y="62" width="100" height="26" rx="13" fill={COLORS.text} />
        <text x="84" y="80" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="12.5" fontWeight={600} fill={COLORS.surface}>
          Tue 9:30 AM
        </text>
        <circle cx="313" cy="239" r="13" fill={COLORS.primary} />
        <circle cx="313" cy="239" r="4.8" fill={COLORS.surface} />
        <circle cx="417" cy="312" r="13" fill={COLORS.primary} />
        <circle cx="417" cy="312" r="4.8" fill={COLORS.surface} />
      </svg>

      {/* A sample pick card, for illustration only: not a control. */}
      <div
        className="absolute bottom-0 left-[6%] right-[14%] flex flex-col gap-2.5 rounded-card border border-border bg-card px-5 py-[18px] shadow-float"
        aria-label="Sample pick card"
        role="img"
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-base font-bold">
            Saguaro Bean Co.
            <Badge variant="sample">Sample</Badge>
          </div>
          <div className="font-display text-xl font-bold">$6.00</div>
        </div>
        <div className="text-[15px] text-body-text">&ldquo;Saguaro Bean is two blocks from your 9:30 and the deal runs until 11.&rdquo;</div>
        <div className="flex gap-2.5" aria-hidden="true">
          <span className="flex min-h-touch flex-1 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground">
            Yes
          </span>
          <span className="flex min-h-touch flex-1 items-center justify-center rounded-full border border-outline-border bg-card text-[15px] font-semibold">
            Not now
          </span>
        </div>
      </div>
    </div>
  );
}
