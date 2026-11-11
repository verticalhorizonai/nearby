// The My week map (F1.2, F2.1; spec 3.11 My week: "map on the right (stacked on mobile)"): every usable appointment
// of the week at its true relative position, drawn in the same palette as the appointment map. A pin opens that
// appointment; the hovered or focused stop shows its label. Turned-off appointments are drawn grey.
import { useNavigate } from 'react-router-dom';
import type { Appointment } from '@/shared/types';
import { formatDayShortTime } from '@/client/format';
import { fitFrame, project } from './projection';
import { MapGround } from './MapMarkers';
import { COLORS } from '@/styles/tokens';

const W = 358;
const H = 300;

interface WeekMapProps {
  appointments: Appointment[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
}

export function WeekMap({ appointments, activeId, onActiveChange }: WeekMapProps) {
  const navigate = useNavigate();
  const { origin, frame } = fitFrame(
    appointments.map((a) => a.location),
    W,
    H,
    44,
  );
  // Draw the active pin last so its label sits on top.
  const ordered = [...appointments].sort((a, b) => (a.id === activeId ? 1 : 0) - (b.id === activeId ? 1 : 0));

  return (
    <div className="overflow-hidden rounded-card border border-border bg-tint">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="group"
        aria-label={`Map of this week's ${appointments.length} appointments around Tucson`}
        data-testid="week-map"
      >
        <MapGround width={W} height={H} />
        {ordered.map((a) => {
          const pt = project(frame, origin, a.location);
          const active = a.id === activeId;
          const fill = a.enabled ? COLORS.primary : COLORS.placeDot;
          const label = formatDayShortTime(a.startsAt);
          const lw = label.length * 7 + 22;
          return (
            <g
              key={a.id}
              className="map-pin"
              data-active={active ? 'true' : 'false'}
              tabIndex={0}
              role="link"
              aria-label={`${a.title}, ${label}${a.enabled ? '' : ', turned off'}`}
              onMouseEnter={() => onActiveChange(a.id)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => onActiveChange(a.id)}
              onBlur={() => onActiveChange(null)}
              onClick={() => navigate(`/appointments/${a.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/appointments/${a.id}`);
                }
              }}
            >
              <title>{a.title}</title>
              {/* A 44 px hit area around the pin (REQ-08-09): transparent, but it takes the tap. */}
              <circle cx={pt.x} cy={pt.y} r={26} fill="transparent" />
              {active && <circle cx={pt.x} cy={pt.y} r={19} fill={fill} opacity={0.18} />}
              <circle className="map-pin-ring" cx={pt.x} cy={pt.y} r={11} fill={fill} stroke={COLORS.surface} strokeWidth={1.5} />
              <circle cx={pt.x} cy={pt.y} r={4} fill={COLORS.surface} />
              {active && (
                <g pointerEvents="none">
                  <rect x={pt.x - lw / 2} y={pt.y + 15} width={lw} height={24} rx={12} fill={COLORS.text} />
                  <text x={pt.x} y={pt.y + 31.5} textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize={12} fontWeight={600} fill={COLORS.surface}>
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
