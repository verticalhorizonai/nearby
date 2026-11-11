// SVG marker shapes shared by the appointment map and the My week map (spec 3.11.2 The map; REQ-02-01):
// the appointment is a #1F5C45 disc with a white centre and a dark label; an offer is an accent pin with a white
// centre and the #F4B63F glow; other places are small grey dots. Pins take hover and focus states (globals.css).
import { COLORS } from '@/styles/tokens';

/** The pale street blocks drawn on the map's ground (design/appointment-detail.html). */
export function MapGround({ width, height }: { width: number; height: number }) {
  const cols = [
    [-10, 96],
    [98, 110],
    [220, 70],
    [302, 70],
  ];
  const rows = [
    [-10, 70],
    [72, 84],
    [168, 110],
  ];
  const sx = width / 358;
  const sy = height / 260;
  return (
    <g aria-hidden="true">
      <rect width={width} height={height} fill={COLORS.tint} />
      <g fill={COLORS.mapBlock}>
        {rows.map(([y, h]) =>
          cols.map(([x, w]) => (
            <rect key={`${x}-${y}`} x={x * sx} y={y * sy} width={w * sx} height={h * sy} rx={6} />
          )),
        )}
      </g>
    </g>
  );
}

interface AppointmentPinProps {
  x: number;
  y: number;
  label: string;
  /** Smaller pin with no label (the My week map draws labels only for the selected stop). */
  compact?: boolean;
  selected?: boolean;
}

export function AppointmentPin({ x, y, label, compact = false, selected = false }: AppointmentPinProps) {
  const r = compact ? 10 : 15;
  const labelWidth = Math.max(72, label.length * 7 + 22);
  return (
    <g>
      {selected && <circle cx={x} cy={y} r={r + 7} fill={COLORS.primary} opacity={0.18} />}
      <circle cx={x} cy={y} r={r} fill={COLORS.primary} className="map-pin-ring" stroke={COLORS.surface} strokeWidth={compact ? 1.5 : 0} />
      <circle cx={x} cy={y} r={compact ? 3.8 : 5.5} fill={COLORS.surface} />
      {(!compact || selected) && (
        <g>
          <rect x={x - labelWidth / 2} y={y + r + 5} width={labelWidth} height={24} rx={12} fill={COLORS.text} />
          <text
            x={x}
            y={y + r + 21.5}
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize={12}
            fontWeight={600}
            fill={COLORS.surface}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** An offer pin: tip at (x, y). */
export function OfferPinShape({ x, y }: { x: number; y: number }) {
  const top = y - 23;
  return (
    <>
      <circle cx={x} cy={y - 3} r={26} fill={COLORS.glow} opacity={0.4} />
      <path
        className="map-pin-ring"
        d={`M${x} ${top}c-7.2 0-13 5.6-13 12.5 0 9.2 13 23 13 23s13-13.8 13-23c0-6.9-5.8-12.5-13-12.5z`}
        fill={COLORS.accent}
      />
      <circle cx={x} cy={top + 12.5} r={4.8} fill={COLORS.surface} />
    </>
  );
}

/** A dark name chip drawn above an active pin. */
export function PinLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(60, text.length * 6.8 + 20);
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y - 24} width={w} height={22} rx={11} fill={COLORS.text} />
      <text x={x} y={y - 9} textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize={11.5} fontWeight={600} fill={COLORS.surface}>
        {text}
      </text>
    </g>
  );
}
