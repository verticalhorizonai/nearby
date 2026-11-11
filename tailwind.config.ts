import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Theme for Nearby (spec 3.11.2; REQ-08-02, REQ-08-04). Every colour is a CSS variable in src/styles/globals.css,
// written as RGB channels so Tailwind's opacity modifiers work and the hex values stay exact.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '16px', sm: '32px' }, screens: { '2xl': '1120px' } },
    extend: {
      screens: { desk: '900px' },
      colors: {
        border: v('border'),
        input: v('outline-border'),
        ring: v('primary'),
        background: v('background'),
        foreground: v('foreground'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground'), hover: v('primary-hover') },
        secondary: { DEFAULT: v('card'), foreground: v('foreground') },
        destructive: { DEFAULT: v('error'), foreground: v('primary-foreground') },
        muted: { DEFAULT: v('background'), foreground: v('secondary-text') },
        accent: { DEFAULT: v('tint'), foreground: v('foreground') },
        card: { DEFAULT: v('card'), foreground: v('foreground') },
        popover: { DEFAULT: v('card'), foreground: v('foreground') },
        tint: v('tint'),
        'accent-pink': v('accent-pink'),
        'badge-bg': v('badge-bg'),
        glow: v('glow'),
        'secondary-text': v('secondary-text'),
        'body-text': v('body-text'),
        'outline-border': v('outline-border'),
        banner: { DEFAULT: v('banner'), foreground: v('banner-text') },
        error: v('error'),
        'place-dot': v('place-dot'),
        'map-block': v('map-block'),
        'map-park': v('map-park'),
        'primary-raised': v('primary-raised'),
        'on-primary-muted': v('on-primary-muted'),
        'on-dark-muted': v('on-dark-muted'),
        divider: v('divider'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      fontSize: {
        badge: ['11px', { lineHeight: '1.3', letterSpacing: '0.05em', fontWeight: '700' }],
        label: ['13px', { lineHeight: '1.4', letterSpacing: '0.06em', fontWeight: '600' }],
        price: ['24px', { lineHeight: '1.1' }],
        code: ['28px', { lineHeight: '1.2', letterSpacing: '0.18em' }],
      },
      borderRadius: { hero: '28px', section: '24px', card: '20px', panel: '14px', tile: '12px' },
      boxShadow: { pick: '0 8px 24px rgba(20, 35, 28, 0.08)', float: '0 18px 40px rgba(20, 35, 28, 0.16)' },
      maxWidth: { content: '1120px' },
      minHeight: { touch: '44px' },
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [animate],
};

export default config;
