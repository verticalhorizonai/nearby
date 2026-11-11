// Edge inputs of the offer form (spec 3.8; ruling 4; NEG-08-08-01..04).
import { describe, expect, it } from 'vitest';
import { parseDollarsToCents, validateCreateOffer } from './offerForm.js';

const good = { title: 'Iced tea', priceCents: 600, regularPriceCents: null, category: 'coffee', validDays: ['mon'], validStartTime: '07:00', validEndTime: '11:00' };
const fields = (input: object) => {
  const r = validateCreateOffer(input);
  return r.ok ? [] : r.fieldErrors.map((e) => e.field);
};

describe('dollars to cents (ruling 4: more than two decimals is refused, never rounded)', () => {
  it.each([['6', 600], ['6.0', 600], ['6.00', 600], ['.5', 50], ['500.00', 50000], [' 12.5 ', 1250], ['0.05', 5]])('%s -> %i', (s, c) => {
    expect(parseDollarsToCents(s)).toBe(c);
  });
  it.each(['6.001', '1e3', '-5', '$6', '', '.', 'abc', '6.', '1,000'])('%s is refused', (s) => {
    expect(parseDollarsToCents(s)).toBeNull();
  });
});

describe('validateCreateOffer', () => {
  it('accepts a good offer and normalises days', () => {
    const r = validateCreateOffer({ ...good, validDays: ['fri', 'mon', 'mon'], title: '  Iced tea ' });
    expect(r).toEqual({ ok: true, value: { ...good, validDays: ['mon', 'fri'] } });
  });
  it('title 1 to 60 characters', () => {
    expect(fields({ ...good, title: '' })).toEqual(['title']);
    expect(fields({ ...good, title: '   ' })).toEqual(['title']);
    expect(fields({ ...good, title: 'x'.repeat(60) })).toEqual([]);
    expect(fields({ ...good, title: 'x'.repeat(61) })).toEqual(['title']);
  });
  it('price 50 to 50,000 cents; regular price above the price', () => {
    expect(fields({ ...good, priceCents: 49 })).toEqual(['priceCents']);
    expect(fields({ ...good, priceCents: 50 })).toEqual([]);
    expect(fields({ ...good, priceCents: 50000 })).toEqual([]);
    expect(fields({ ...good, priceCents: 50001 })).toEqual(['priceCents']);
    expect(fields({ ...good, priceCents: 6.5 })).toEqual(['priceCents']);
    expect(fields({ ...good, regularPriceCents: 600 })).toEqual(['regularPriceCents']);
    expect(fields({ ...good, regularPriceCents: 601 })).toEqual([]);
  });
  it('category, days and times', () => {
    expect(fields({ ...good, category: 'brunch' })).toEqual(['category']);
    expect(fields({ ...good, validDays: [] })).toEqual(['validDays']);
    expect(fields({ ...good, validDays: ['mon', 'funday'] })).toEqual(['validDays']);
    expect(fields({ ...good, validStartTime: '11:00', validEndTime: '11:00' })).toEqual(['validEndTime']);
    expect(fields({ ...good, validStartTime: '12:00', validEndTime: '11:00' })).toEqual(['validEndTime']);
    expect(fields({ ...good, validEndTime: '24:00' })).toEqual(['validEndTime']);
  });
});
