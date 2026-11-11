// Every boundary of spec 3.5.2.
import { describe, expect, it } from 'vitest';
import { timeFit } from './timeFit.js';
const t = (h: number, m: number) => h * 60 + m;
describe('time fit boundaries (3.5.2)', () => {
  it.each([
    ['coffee', 5, 59, 0], ['coffee', 6, 0, 1], ['coffee', 10, 59, 1], ['coffee', 11, 0, 0.6], ['coffee', 13, 59, 0.6], ['coffee', 14, 0, 0],
    ['lunch', 9, 59, 0], ['lunch', 10, 0, 0.6], ['lunch', 10, 59, 0.6], ['lunch', 11, 0, 1], ['lunch', 13, 59, 1], ['lunch', 14, 0, 0.6], ['lunch', 14, 59, 0.6], ['lunch', 15, 0, 0],
    ['dinner', 14, 59, 0], ['dinner', 15, 0, 0.6], ['dinner', 16, 59, 0.6], ['dinner', 17, 0, 1], ['dinner', 21, 0, 1], ['dinner', 21, 1, 0],
    ['juice_or_snack', 9, 59, 0], ['juice_or_snack', 10, 0, 0.6], ['juice_or_snack', 17, 59, 0.6], ['juice_or_snack', 18, 0, 0],
    ['service', 0, 0, 0.3], ['service', 12, 0, 0.3], ['service', 23, 59, 0.3],
  ] as const)('%s at %i:%i is %d', (cat, h, m, fit) => {
    expect(timeFit(cat, t(h, m))).toBe(fit);
  });
});
