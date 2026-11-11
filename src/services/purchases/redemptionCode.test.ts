// Redemption code (3.7.4): six characters from A-Z and 2-9 without I and O.
import { describe, expect, it } from 'vitest';
import { generateRedemptionCode } from './redemptionCode.js';
import { REDEMPTION_CODE_ALPHABET } from '../../shared/types.js';

describe('redemption code', () => {
  it('is six characters from the alphabet, never I, O, 0 or 1', () => {
    for (let i = 0; i < 2000; i++) {
      const c = generateRedemptionCode();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
    expect(REDEMPTION_CODE_ALPHABET).toHaveLength(32);
    expect(REDEMPTION_CODE_ALPHABET).not.toMatch(/[IO01]/);
  });
  it('uses every character of the alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const ch of generateRedemptionCode()) seen.add(ch);
    expect(seen.size).toBe(32);
  });
});
