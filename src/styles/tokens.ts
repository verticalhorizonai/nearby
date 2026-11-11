// The palette as constants, for SVG drawings that cannot read Tailwind classes (the mark, the maps). The same values
// are the theme's CSS variables in globals.css (spec 3.11.2 Colors; REQ-08-02).
export const COLORS = {
  page: '#F6F8F4',
  surface: '#FFFFFF',
  text: '#14231C',
  bodyText: '#33443C',
  secondaryText: '#4E5F57',
  primary: '#1F5C45',
  primaryHover: '#14402F',
  tint: '#E3ECE4',
  accent: '#B4266B',
  badgeBg: '#F7E6EE',
  glow: '#F4B63F',
  border: '#DDE5DD',
  outlineBorder: '#C9D4CB',
  error: '#B3261E',
  banner: '#14231C',
  bannerText: '#E8EFE9',
  /** Small grey dots for other places on the map (design/appointment-detail.html). */
  placeDot: '#9FB0A4',
  /** Pale street blocks on the map's ground (design/appointment-detail.html). */
  mapBlock: '#F4F8F3',
  /** A park on the map's ground (design/home.html). */
  mapPark: '#CFE2D2',
  /** Grey dots for other places on the hero drawing (design/home.html). */
  placeDotLight: '#A9B8AD',
} as const;
