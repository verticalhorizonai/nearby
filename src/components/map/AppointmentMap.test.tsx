// @vitest-environment jsdom
// The appointment map (REQ-02-01, REQ-02-04; spec 3.11.2 The map): the SVG plot with its chips, and a silent fall
// back from Google's map to the SVG plot when the Maps script fails to load.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AppointmentMapData } from '@/shared/types';
import { AppointmentMap } from './AppointmentMap';
import { frameFor, project } from './projection';

afterEach(cleanup);

const data: AppointmentMapData = {
  appointment: {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Client meeting',
    startsAt: '2026-11-17T16:30:00.000Z',
    endsAt: '2026-11-17T17:30:00.000Z',
    address: 'Old Main, University of Arizona',
    location: { lat: 32.2319, lng: -110.9535 },
    enabled: true,
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
  },
  searchRadiusMeters: 4828,
  renderMode: 'svg_plot',
  places: [],
  placesAttributions: [],
  merchants: [{ merchantId: 'm1', merchantName: 'Saguaro Bean Co.', location: { lat: 32.2335, lng: -110.9515 }, isSample: true, hasOffer: true }],
};

describe('AppointmentMap', () => {
  it('draws the SVG plot with the radius chip and no Places chip when there are no places', () => {
    render(<AppointmentMap data={data} browserKey={null} />);
    expect(screen.getByTestId('svg-plot')).toBeInTheDocument();
    expect(screen.getByTestId('radius-circle')).toHaveAttribute('stroke-dasharray', '3 6');
    expect(screen.getByText('3 miles')).toBeInTheDocument();
    expect(screen.queryByText('Places from Google')).not.toBeInTheDocument();
  });

  it('shows a merchant name on an offer pin when it takes focus', () => {
    render(<AppointmentMap data={data} browserKey={null} />);
    const pin = screen.getByRole('img', { name: 'Offer from Saguaro Bean Co. (Sample)' });
    fireEvent.focus(pin);
    expect(pin).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Saguaro Bean Co. · Sample')).toBeInTheDocument();
  });

  it('falls back to the SVG plot, with no error, when Google Maps fails to load; keeps the attributions', () => {
    const google: AppointmentMapData = {
      ...data,
      renderMode: 'google_maps',
      places: [{ placeId: 'p1', name: 'Example Cafe', location: { lat: 32.233, lng: -110.952 } }],
      placesAttributions: ['Google Maps'],
    };
    render(<AppointmentMap data={google} browserKey="browser-key-for-test" />);
    expect(screen.getByTestId('google-map')).toBeInTheDocument();
    const script = document.head.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
    expect(script).not.toBeNull();
    fireEvent.error(script as HTMLScriptElement);
    return screen.findByTestId('svg-plot').then(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Places from Google')).toBeInTheDocument();
      expect(screen.getByTestId('places-attributions')).toHaveTextContent('Google Maps');
    });
  });

  it('projects at true relative positions: north is up, east is right, the radius spans the plot radius', () => {
    const frame = frameFor(358, 260, 1609, 112);
    const o = data.appointment.location;
    const north = project(frame, o, { lat: o.lat + 0.01, lng: o.lng });
    const east = project(frame, o, { lat: o.lat, lng: o.lng + 0.01 });
    expect(north.y).toBeLessThan(130);
    expect(east.x).toBeGreaterThan(179);
    // 1,609 m due north lands on the radius circle.
    const edge = project(frame, o, { lat: o.lat + 1609 / 110_574, lng: o.lng });
    expect(Math.round(130 - edge.y)).toBe(112);
  });
});
