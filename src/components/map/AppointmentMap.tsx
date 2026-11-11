// The appointment map (F2.1; REQ-02-01, REQ-02-04, REQ-02-05; spec 3.11.2 The map). With renderMode 'google_maps'
// and a browser key it draws the markers on Google's map with the Places attributions; otherwise, or on any load
// failure, it draws the same picture as an SVG plot at true relative positions, silently.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppointmentMapData } from '@/shared/types';
import { formatRadius, formatShortTime } from '@/client/format';
import { cn } from '@/components/ui/cn';
import { frameFor, project } from './projection';
import { AppointmentPin, MapGround, OfferPinShape, PinLabel } from './MapMarkers';
import { loadGoogleMaps, onGoogleAuthFailure, type GOverlay } from './googleMaps';
import { COLORS } from '@/styles/tokens';

const W = 358;
const H = 260;
const RADIUS_PX = 112;

interface AppointmentMapProps {
  data: AppointmentMapData;
  /** `PublicConfig.googleMapsBrowserKey`; null draws the SVG plot. */
  browserKey: string | null;
  className?: string;
}

function MapChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('absolute bottom-2.5 rounded-full border border-border bg-card px-2.5 py-[5px] text-[11px] leading-none text-body-text', className)}>
      {children}
    </div>
  );
}

export function AppointmentMap({ data, browserKey, className }: AppointmentMapProps) {
  const wantsGoogle = data.renderMode === 'google_maps' && !!browserKey;
  const [googleFailed, setGoogleFailed] = useState(false);
  const useGoogle = wantsGoogle && !googleFailed;
  const showPlacesChip = data.places.length > 0;

  return (
    <figure className={cn('m-0', className)}>
      <div className="relative overflow-hidden rounded-card border border-border bg-tint">
        {useGoogle ? (
          <GoogleMapView data={data} browserKey={browserKey as string} onFail={() => setGoogleFailed(true)} />
        ) : (
          <SvgPlot data={data} />
        )}
        {showPlacesChip && <MapChip className="left-2.5">Places from Google</MapChip>}
        <MapChip className="right-2.5">{formatRadius(data.searchRadiusMeters)}</MapChip>
      </div>
      {showPlacesChip && data.placesAttributions.length > 0 && (
        <figcaption className="mt-1.5 px-1 text-[11px] text-secondary-text" data-testid="places-attributions">
          {data.placesAttributions.join(' · ')}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// SVG plot
// ---------------------------------------------------------------------------------------------------------------

export function SvgPlot({ data }: { data: AppointmentMapData }) {
  const [active, setActive] = useState<string | null>(null);
  const origin = data.appointment.location;
  const frame = frameFor(W, H, data.searchRadiusMeters, RADIUS_PX);
  const centre = project(frame, origin, origin);
  const offers = data.merchants.filter((m) => m.hasOffer);
  const others = data.merchants.filter((m) => !m.hasOffer);
  const label = `Your ${formatShortTime(data.appointment.startsAt)}`;
  const activeMerchant = offers.find((m) => m.merchantId === active) ?? null;
  const offerNames = offers.map((m) => m.merchantName).join(', ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Map of the area around ${data.appointment.title}: the appointment pin, a ${formatRadius(data.searchRadiusMeters)} radius${
        offers.length ? `, offers from ${offerNames}` : ''
      } and other places nearby`}
      data-testid="svg-plot"
    >
      <MapGround width={W} height={H} />
      <circle cx={centre.x} cy={centre.y} r={RADIUS_PX} fill={COLORS.primary} opacity={0.07} />
      <circle
        cx={centre.x}
        cy={centre.y}
        r={RADIUS_PX}
        fill="none"
        stroke={COLORS.primary}
        strokeWidth={1.5}
        strokeDasharray="3 6"
        opacity={0.6}
        data-testid="radius-circle"
      />
      <g fill={COLORS.placeDot} aria-hidden="true">
        {data.places.map((p) => {
          const pt = project(frame, origin, p.location);
          return <circle key={p.placeId} cx={pt.x} cy={pt.y} r={4} data-pin-kind="place" />;
        })}
        {others.map((m) => {
          const pt = project(frame, origin, m.location);
          return <circle key={m.merchantId} cx={pt.x} cy={pt.y} r={4} data-pin-kind="merchant" />;
        })}
      </g>
      {offers.map((m) => {
        const pt = project(frame, origin, m.location);
        const name = `${m.merchantName}${m.isSample ? ' (Sample)' : ''}`;
        return (
          <g
            key={m.merchantId}
            className="map-pin"
            tabIndex={0}
            role="img"
            aria-label={`Offer from ${name}`}
            data-pin-kind="offer"
            data-active={active === m.merchantId ? 'true' : 'false'}
            onMouseEnter={() => setActive(m.merchantId)}
            onMouseLeave={() => setActive((a) => (a === m.merchantId ? null : a))}
            onFocus={() => setActive(m.merchantId)}
            onBlur={() => setActive((a) => (a === m.merchantId ? null : a))}
          >
            <title>{name}</title>
            <OfferPinShape x={pt.x} y={pt.y} />
          </g>
        );
      })}
      <g className="map-pin" tabIndex={0} role="img" aria-label={`${data.appointment.title}, ${label}`} data-pin-kind="appointment">
        <AppointmentPin x={centre.x} y={centre.y} label={label} />
      </g>
      {activeMerchant &&
        (() => {
          const pt = project(frame, origin, activeMerchant.location);
          return <PinLabel x={pt.x} y={pt.y - 26} text={`${activeMerchant.merchantName}${activeMerchant.isSample ? ' · Sample' : ''}`} />;
        })()}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Google map
// ---------------------------------------------------------------------------------------------------------------

const OFFER_PIN_PATH = 'M0 -23c-7.2 0-13 5.6-13 12.5 0 9.2 13 23 13 23s13-13.8 13-23c0-6.9-5.8-12.5-13-12.5z';

function GoogleMapView({ data, browserKey, onFail }: { data: AppointmentMapData; browserKey: string; onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    let live = true;
    const overlays: GOverlay[] = [];
    const stopAuth = onGoogleAuthFailure(() => failRef.current());

    loadGoogleMaps(browserKey)
      .then((g) => {
        if (!live || !el.current) return;
        const centre = data.appointment.location;
        const map = new g.Map(el.current, {
          center: centre,
          zoom: data.searchRadiusMeters > 2000 ? 13 : 14,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        overlays.push(
          new g.Circle({
            map,
            center: centre,
            radius: data.searchRadiusMeters,
            strokeColor: COLORS.primary,
            strokeOpacity: 0.6,
            strokeWeight: 1.5,
            fillColor: COLORS.primary,
            fillOpacity: 0.07,
            clickable: false,
          }),
        );
        for (const p of data.places) {
          overlays.push(
            new g.Marker({
              map,
              position: p.location,
              title: p.name,
              icon: { path: g.SymbolPath.CIRCLE, scale: 4, fillColor: COLORS.placeDot, fillOpacity: 1, strokeWeight: 0 },
            }),
          );
        }
        for (const m of data.merchants) {
          const title = `${m.merchantName}${m.isSample ? ' (Sample)' : ''}`;
          if (m.hasOffer) {
            // Glow, pin and white centre, each anchored to the merchant's position (the pin's tip).
            overlays.push(
              new g.Marker({
                map,
                position: m.location,
                clickable: false,
                icon: { path: g.SymbolPath.CIRCLE, scale: 26, fillColor: COLORS.glow, fillOpacity: 0.4, strokeWeight: 0, anchor: new g.Point(0, 3 / 26) },
              }),
              new g.Marker({
                map,
                position: m.location,
                title,
                optimized: false,
                icon: { path: OFFER_PIN_PATH, fillColor: COLORS.accent, fillOpacity: 1, strokeWeight: 0, scale: 1, anchor: new g.Point(0, 0) },
              }),
              new g.Marker({
                map,
                position: m.location,
                clickable: false,
                icon: { path: g.SymbolPath.CIRCLE, scale: 4.8, fillColor: COLORS.surface, fillOpacity: 1, strokeWeight: 0, anchor: new g.Point(0, 10.5 / 4.8) },
              }),
            );
          } else {
            overlays.push(
              new g.Marker({
                map,
                position: m.location,
                title,
                icon: { path: g.SymbolPath.CIRCLE, scale: 4, fillColor: COLORS.placeDot, fillOpacity: 1, strokeWeight: 0 },
              }),
            );
          }
        }
        overlays.push(
          new g.Marker({
            map,
            position: centre,
            title: `${data.appointment.title}, your ${formatShortTime(data.appointment.startsAt)}`,
            optimized: false,
            zIndex: 1000,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 15,
              fillColor: COLORS.primary,
              fillOpacity: 1,
              strokeWeight: 0,
              labelOrigin: new g.Point(0, 2.4),
            },
            label: { text: `Your ${formatShortTime(data.appointment.startsAt)}`, color: COLORS.surface, fontSize: '12px', fontWeight: '600', className: 'nearby-map-label' },
          }),
          new g.Marker({
            map,
            position: centre,
            clickable: false,
            zIndex: 1001,
            icon: { path: g.SymbolPath.CIRCLE, scale: 5.5, fillColor: COLORS.surface, fillOpacity: 1, strokeWeight: 0 },
          }),
        );
      })
      .catch(() => {
        if (live) failRef.current();
      });

    return () => {
      live = false;
      stopAuth();
      overlays.forEach((o) => o.setMap(null));
    };
  }, [data, browserKey]);

  return <div ref={el} className="aspect-[358/260] w-full" data-testid="google-map" aria-label={`Map of the area around ${data.appointment.title}`} role="region" />;
}
