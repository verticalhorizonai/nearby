// WCAG AA for every text/background pair the theme uses (spec 3.11.2 Colors; AC-REQ-08-02-01, register G-33):
// 4.5 to 1, or 3 to 1 for text of 24 px and larger.
import { describe, expect, it } from 'vitest';
import { COLORS } from '../../src/styles/tokens.js';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [text, background, where, large text?]
const PAIRS: [keyof typeof COLORS, keyof typeof COLORS, string, boolean][] = [
  ['text', 'page', 'headings and body on the page', false],
  ['text', 'surface', 'text on cards', false],
  ['bodyText', 'surface', 'body text on light panels', false],
  ['bodyText', 'page', 'reason quotation on the #F6F8F4 panel', false],
  ['secondaryText', 'surface', 'distance and valid window on cards', false],
  ['secondaryText', 'page', 'secondary text on the page', false],
  ['primary', 'page', 'links and the selected state on the page', false],
  ['primary', 'surface', 'links on cards', false],
  ['primary', 'tint', 'seat chip text on the tint', false],
  ['text', 'tint', 'text on chips', false],
  ['surface', 'primary', 'primary button text', false],
  ['surface', 'primaryHover', 'primary button text, hover and press', false],
  ['accent', 'badgeBg', 'the Sample badge', false],
  ['accent', 'surface', 'accent text on cards', false],
  ['bannerText', 'banner', 'the demonstration banner and the How to test panel', false],
  ['error', 'surface', 'field errors', false],
  ['error', 'page', 'field errors on the page', false],
  ['text', 'glow', 'nothing is written on the glow; checked anyway', false],
];

describe('WCAG AA contrast of the theme', () => {
  it.each(PAIRS)('%s on %s (%s)', (fg, bg, _where, large) => {
    expect(contrast(COLORS[fg], COLORS[bg])).toBeGreaterThanOrEqual(large ? 3 : 4.5);
  });
});
