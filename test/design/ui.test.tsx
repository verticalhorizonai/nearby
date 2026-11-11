// @vitest-environment jsdom
// Design rules a person grades by eye, checked in the markup (spec 3.11.2; AC-REQ-08-01-01, AC-REQ-08-01-02,
// AC-REQ-08-03-01, AC-REQ-08-04-01, AC-REQ-08-05-01, AC-REQ-08-05-02, AC-REQ-08-09-02).
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { Button } from '../../src/components/ui/button.js';
import { Badge } from '../../src/components/ui/badge.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('controls and badges (shadcn/ui)', () => {
  it('every default and large button is at least 44 px; Yes and Not now are 48 px', () => {
    const { getByText } = render(<><Button>Default</Button><Button size="lg">Large</Button></>);
    expect(getByText('Default').className).toMatch(/\bmin-h-touch\b/);
    expect(read('tailwind.config.ts')).toMatch(/touch: '44px'/);
    expect(getByText('Large').className).toMatch(/\bh-12\b/);
    expect(read('src/components/ui/button.tsx')).not.toMatch(/\bh-(?:[1-9]|10)\b/);
  });
  it('one Sample badge everywhere: the badge component with the accent on its tint', () => {
    const { getByText } = render(<Badge variant="sample">Sample</Badge>);
    expect(getByText('Sample').className).toMatch(/uppercase/);
    const users = ['src/components/picks/PickCard.tsx', 'src/components/seats/MerchantSeatCardLink.tsx', 'src/components/merchant/MerchantProfileCard.tsx'];
    for (const f of users) expect(read(f), f).toMatch(/<Badge[^>]*variant="sample"/);
  });
  it('the screens use the shared components, not hand-written component CSS', () => {
    const css = read('src/styles/globals.css');
    expect(css).not.toMatch(/\.(btn|card|badge|button)\b/);
    for (const f of ['src/pages/MerchantDashboardPage.tsx', 'src/components/merchant/OfferForm.tsx']) {
      expect(read(f)).toMatch(/components\/ui\//);
    }
  });
});

describe('layout, type and motion', () => {
  it('phone first: the map above the picks; list left and map right from 900 px', () => {
    expect(read('tailwind.config.ts')).toMatch(/900px/);
    const detail = read('src/pages/AppointmentDetailPage.tsx');
    expect(detail.indexOf('AppointmentMap')).toBeLessThan(detail.indexOf('PicksPanel'));
  });
  it('card grids wrap with a minimum card width and no maximum', () => {
    expect(read('src/components/seats/MerchantSeatCardLink.tsx')).toMatch(/minmax\(min\(100%,(2[4-9]\d|300)px\),1fr\)/);
  });
  it('the home headline is 60 px, weight 800, line height 1.02, -0.025em, and 38 px on a phone', () => {
    expect(read('src/pages/HomePage.tsx')).toMatch(/text-\[38px\] font-extrabold leading-\[1\.02\] tracking-\[-0\.025em\] sm:text-\[60px\]/);
  });
  it('fonts are bundled: no font is requested from another host', () => {
    expect(read('src/main.tsx')).toMatch(/@fontsource\/bricolage-grotesque/);
    expect(read('src/main.tsx')).toMatch(/@fontsource\/inter/);
    expect(read('index.html')).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
  it('the seat heading is 48 px and section headings 36 px at every width (AC-REQ-08-04-01)', () => {
    expect(read('src/pages/ChooseSeatPage.tsx')).toMatch(/<h1 className="font-display text-5xl[^"]*">Choose a seat/);
    expect(read('src/pages/ChooseSeatPage.tsx')).not.toMatch(/text-\[40px\]/);
    expect(read('src/pages/HomePage.tsx')).toMatch(/const sectionHeading = 'font-display text-4xl font-bold/);
    expect(read('tailwind.config.ts')).not.toMatch(/'5xl'|'4xl'/); // the default scale: 4xl = 36 px, 5xl = 48 px
  });
  it('toasts move in 200 ms, like every transition (AC-REQ-08-03-01)', () => {
    expect(read('src/styles/globals.css')).toMatch(/\[data-sonner-toast\] \{\s*transition-duration: 200ms !important;/);
  });
  it('every thumb control is at least 44 px: header home link, map pins, footer and 404 links (AC-REQ-08-09-02)', () => {
    expect(read('src/components/layout/AppHeader.tsx')).toMatch(/to="\/" className="flex min-h-touch/);
    expect(read('src/components/map/WeekMap.tsx')).toMatch(/r=\{26\} fill="transparent"/);
    expect(read('src/pages/HomePage.tsx')).toMatch(/inline-flex min-h-touch items-center font-semibold" rel="noopener"/);
    expect(read('src/pages/NotFoundPage.tsx')).toMatch(/className="inline-flex min-h-touch items-center"/);
  });
  it('a turned-off appointment keeps readable contrast: no opacity on its text (spec 3.11.2)', () => {
    expect(read('src/pages/MyWeekPage.tsx')).not.toMatch(/opacity-60/);
  });
  it('motion stops when the visitor asks for reduced motion', () => {
    expect(read('src/styles/globals.css')).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(read('src/hooks/useReducedMotion.ts')).toMatch(/prefers-reduced-motion: reduce/);
  });
});
