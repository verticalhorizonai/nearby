// Event filtering edges (3.2.3; build ruling 15(a)).
import { describe, expect, it } from 'vitest';
import { skipReason, isVideoLocation } from './eventFilter.js';
const here = { lat: 32.2318, lng: -110.9535 };
const ev = (location_text: string | null, all_day = false) => ({ all_day, location_text });
describe('event filter', () => {
  it('skips all-day, missing or blank locations', () => {
    expect(skipReason(ev('Old Main', true), here)).toBe('all_day');
    expect(skipReason(ev(null), here)).toBe('no_address');
    expect(skipReason(ev('   '), here)).toBe('no_address');
  });
  it('skips video links and the words virtual, online, call (whole words, any case)', () => {
    for (const v of ['https://us02web.zoom.us/j/123', 'MEET.GOOGLE.COM/abc', 'https://teams.microsoft.com/l/x', 'acme.webex.com/meet', 'Virtual', 'online meeting', 'Team Call']) {
      expect(isVideoLocation(v)).toBe(true);
    }
    expect(isVideoLocation('Callaway Blvd, Tucson')).toBe(false);
    expect(isVideoLocation('Recall Rd')).toBe(false);
  });
  it('skips no coordinates and anything over 48,280 m from downtown Tucson', () => {
    expect(skipReason(ev('Somewhere'), null)).toBe('no_coordinates');
    // 48,280 m north of downtown is kept; 48,300 m is skipped (1 degree of latitude is about 111,195 m).
    expect(skipReason(ev('North'), { lat: 32.2226 + 48_270 / 111_195, lng: -110.9747 })).toBeNull();
    expect(skipReason(ev('Far north'), { lat: 32.2226 + 48_300 / 111_195, lng: -110.9747 })).toBe('out_of_area');
    expect(skipReason(ev('Old Main'), here)).toBeNull();
  });
});
