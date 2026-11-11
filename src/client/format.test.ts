import { describe, expect, it } from 'vitest';
import {
  formatCents,
  formatDayTimeRange,
  formatMiles,
  formatRadius,
  formatShortTime,
  formatValidDays,
  formatValidWindow,
} from './format';

describe('formatCents (spec 3.7.4, integer arithmetic only; REQ-03-09)', () => {
  it.each([
    [5, '$0.05'],
    [150, '$1.50'],
    [600, '$6.00'],
    [1250, '$12.50'],
    [50000, '$500.00'],
  ])('%i cents reads %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});

describe('distance and radius', () => {
  it('shows miles to one decimal', () => {
    expect(formatMiles(322)).toBe('0.2 mi');
    expect(formatMiles(805)).toBe('0.5 mi');
  });
  it('names the radius', () => {
    expect(formatRadius(1609)).toBe('1 mile');
    expect(formatRadius(4828)).toBe('3 miles');
  });
});

describe('valid window', () => {
  it('formats the sample windows', () => {
    expect(formatValidWindow({ validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '07:00', validEndTime: '11:00' })).toBe(
      'Weekdays, 7:00 to 11:00 AM',
    );
    expect(formatValidWindow({ validDays: ['mon', 'tue', 'wed', 'thu', 'fri'], validStartTime: '08:00', validEndTime: '18:00' })).toBe(
      'Weekdays, 8:00 AM to 6:00 PM',
    );
    expect(
      formatValidWindow({ validDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], validStartTime: '16:00', validEndTime: '20:00' }),
    ).toBe('Daily, 4:00 to 8:00 PM');
    expect(formatValidDays(['tue', 'wed', 'thu', 'fri', 'sat'])).toBe('Tue to Sat');
    expect(formatValidDays(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri');
  });
});

describe('appointment times in America/Phoenix', () => {
  it('formats the header line and the map label', () => {
    // 2026-11-17 is a Tuesday; Phoenix is UTC-7 all year.
    expect(formatDayTimeRange('2026-11-17T16:30:00.000Z', '2026-11-17T17:30:00.000Z')).toBe('Tuesday, 9:30 to 10:30 AM');
    expect(formatShortTime('2026-11-17T16:30:00.000Z')).toBe('9:30');
  });
});
