// Continuous Time-of-Day Gradient & Solar-State Theming Engine.
//
// Pure functions of an hourly timestamp and that day's sunrise/sunset:
//   getTimeBlock(iso, sun)   -> 'early-morning' | 'late-morning' | 'afternoon' | 'evening' | 'night'
//   getSolarState(iso, sun)  -> 'night' | 'dawn' | 'sunrise' | 'morning' | 'high-sun' | 'afternoon' | 'golden-hour' | 'sunset' | 'dusk'
//   getMoonPhase(iso)        -> moon phase name, glyph and illumination
//   getHourTheme(iso, sun)   -> smoothly interpolated sky palette, color-temperature wash, vignette & glass tokens
//   weatherGlyph(code, ...)  -> time-appropriate weather icon
//
// Timestamps are Open-Meteo local ISO strings ("2026-10-29T14:00", Asia/Manila, UTC+8).

export type TimeBlock = 'early-morning' | 'late-morning' | 'afternoon' | 'evening' | 'night';

export type SolarState =
  | 'night'
  | 'dawn'
  | 'sunrise'
  | 'morning'
  | 'high-sun'
  | 'afternoon'
  | 'golden-hour'
  | 'sunset'
  | 'dusk';

export interface SunTimes {
  /** Local ISO string, e.g. "2026-10-29T05:42" */
  sunrise?: string;
  sunset?: string;
}

export interface MoonPhase {
  /** 0 = new moon, 0.5 = full moon */
  phase: number;
  name: string;
  glyph: string;
  /** 0..1 fraction of the disc that is lit */
  illumination: number;
}

export interface HourTheme {
  block: TimeBlock;
  solar: SolarState;
  isDay: boolean;
  /** 0..1 sun height above the horizon (0 at night, 1 at solar noon). */
  sunElevation: number;
  /** -1 (cool deep night) .. +1 (warm golden hour / sunrise) color temperature index. */
  colorTemp: number;
  badge: string;
  cloudCover: string;
  /** 3-stop primary sky gradient [zenith, midSky, horizon]. */
  bgGradient: [string, string, string];
  /** Ambient horizon / zenith color-temperature wash [top, mid, bottom]. */
  tempWashGradient: [string, string, string];
  /** Protective depth vignette for foreground UI contrast. */
  overlayGradient: [string, string, string];
  /** Frosted glass card tint pair [topSpecular, baseScrim]. */
  liquidCardTint: [string, string];
  glowColor: string;
  /** Opacity for procedural cloud layers. */
  cloudOpacity: number;
  /** Typography + surface colors tested for contrast across all dynamic skies. */
  text: { primary: string; secondary: string; muted: string; accent: string };
  surface: {
    card: string;
    cardSelected: string;
    border: string;
    borderSelected: string;
    headerScrim: string;
  };
}

const DEFAULT_SUNRISE = 5 * 60 + 45;
const DEFAULT_SUNSET = 17 * 60 + 45;

/** Minutes since local midnight from an ISO string. */
export function minutesOfDay(iso?: string): number | null {
  if (!iso || iso.length < 16) return null;
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Current Cebu wall-clock time as a local ISO string (Asia/Manila is a fixed UTC+8). */
export function manilaIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 16);
}

/** Find the sunrise/sunset entry that matches an hourly timestamp's date. */
export function sunTimesForDate(
  daily: { date: string; sunrise: string; sunset: string }[] | undefined,
  iso: string,
): SunTimes {
  const day = iso.slice(0, 10);
  const match = daily?.find((d) => d.date === day) ?? daily?.[0];
  return { sunrise: match?.sunrise, sunset: match?.sunset };
}

interface SunKeyframes {
  minutes: number;
  rise: number;
  set: number;
  noon: number;
}

function keyframes(iso: string, sun: SunTimes): SunKeyframes {
  const rise = minutesOfDay(sun.sunrise) ?? DEFAULT_SUNRISE;
  const set = minutesOfDay(sun.sunset) ?? DEFAULT_SUNSET;
  const minutes = minutesOfDay(iso) ?? 12 * 60;
  return { minutes, rise, set, noon: (rise + set) / 2 };
}

export function getTimeBlock(iso: string, sun: SunTimes = {}): TimeBlock {
  const { minutes: m, rise, set, noon } = keyframes(iso, sun);
  const midMorning = (rise + noon) / 2;
  if (m >= rise - 45 && m < midMorning) return 'early-morning';
  if (m >= midMorning && m < noon) return 'late-morning';
  if (m >= noon && m < set - 90) return 'afternoon';
  if (m >= set - 90 && m < set + 45) return 'evening';
  return 'night';
}

export function getSolarState(iso: string, sun: SunTimes = {}): SolarState {
  const { minutes: m, rise, set, noon } = keyframes(iso, sun);
  if (m < rise - 45 || m >= set + 45) return 'night';
  if (m < rise) return 'dawn';
  if (m < rise + 45) return 'sunrise';
  if (m < noon - 90) return 'morning';
  if (m < noon + 90) return 'high-sun';
  if (m < set - 75) return 'afternoon';
  if (m < set - 20) return 'golden-hour';
  if (m < set + 15) return 'sunset';
  return 'dusk';
}

export function getSunElevation(iso: string, sun: SunTimes = {}): number {
  const { minutes: m, rise, set } = keyframes(iso, sun);
  if (m <= rise || m >= set) return 0;
  return Math.sin(((m - rise) / (set - rise)) * Math.PI);
}

const MOONS: { name: string; glyph: string }[] = [
  { name: 'New Moon', glyph: '🌑' },
  { name: 'Waxing Crescent', glyph: '🌒' },
  { name: 'First Quarter', glyph: '🌓' },
  { name: 'Waxing Gibbous', glyph: '🌔' },
  { name: 'Full Moon', glyph: '🌕' },
  { name: 'Waning Gibbous', glyph: '🌖' },
  { name: 'Last Quarter', glyph: '🌗' },
  { name: 'Waning Crescent', glyph: '🌘' },
];

export function getMoonPhase(iso: string): MoonPhase {
  const y = parseInt(iso.slice(0, 4), 10);
  const mo = parseInt(iso.slice(5, 7), 10);
  const d = parseInt(iso.slice(8, 10), 10);
  const h = parseInt(iso.slice(11, 13), 10) || 0;
  const utcMs = Date.UTC(y, mo - 1, d, h) - 8 * 3600 * 1000;
  const SYNODIC = 29.530588853;
  const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const days = (utcMs - REF_NEW_MOON) / 86400000;
  const phase = (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  const idx = Math.round(phase * 8) % 8;
  return {
    phase,
    name: MOONS[idx].name,
    glyph: MOONS[idx].glyph,
    illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2,
  };
}

// --- Color & Palette Interpolation Engine --------------------------------------------

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${toHex(lerp(r1, r2, t))}${toHex(lerp(g1, g2, t))}${toHex(lerp(b1, b2, t))}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

interface AnchorPalette {
  state: SolarState;
  badge: string;
  cloudCover: string;
  /** [zenith, midSky, horizon] */
  bg: [string, string, string];
  /** Color-temperature glow color and intensity (-1 cool .. +1 warm) */
  tempColor: string;
  tempAlpha: number;
  colorTemp: number;
  /** Vignette top, mid, bottom opacities over a deep atmospheric base */
  vignetteHex: string;
  vignetteAlphas: [number, number, number];
  /** Frosted glass card tint hex + alpha */
  glassTintHex: string;
  glassAlphaTop: number;
  glassAlphaBottom: number;
  glowColor: string;
  accentColor: string;
  cloudOpacity: number;
}

const ANCHORS: Record<SolarState, AnchorPalette> = {
  night: {
    state: 'night',
    badge: '🌙 DEEP NIGHT',
    cloudCover: '24% Cloud Cover',
    bg: ['#040716', '#0B112C', '#151E42'],
    tempColor: '#3B4CCA',
    tempAlpha: 0.16,
    colorTemp: -0.9,
    vignetteHex: '#02040D',
    vignetteAlphas: [0.32, 0.24, 0.68],
    glassTintHex: '#101738',
    glassAlphaTop: 0.48,
    glassAlphaBottom: 0.68,
    glowColor: '#6C7CFF',
    accentColor: '#B8C4FF',
    cloudOpacity: 0.75,
  },
  dawn: {
    state: 'dawn',
    badge: '🌄 DAWN',
    cloudCover: '34% Cloud Cover',
    bg: ['#131B3E', '#4E3968', '#D47A72'],
    tempColor: '#FF9E80',
    tempAlpha: 0.28,
    colorTemp: 0.65,
    vignetteHex: '#0D0B1F',
    vignetteAlphas: [0.24, 0.20, 0.62],
    glassTintHex: '#281E42',
    glassAlphaTop: 0.46,
    glassAlphaBottom: 0.66,
    glowColor: '#F4A6B8',
    accentColor: '#FFD0DA',
    cloudOpacity: 0.8,
  },
  sunrise: {
    state: 'sunrise',
    badge: '🌅 SUNRISE',
    cloudCover: '38% Cloud Cover',
    bg: ['#1F325C', '#9B5570', '#F59E6C'],
    tempColor: '#FFB36B',
    tempAlpha: 0.34,
    colorTemp: 0.95,
    vignetteHex: '#141026',
    vignetteAlphas: [0.20, 0.18, 0.60],
    glassTintHex: '#2E203E',
    glassAlphaTop: 0.45,
    glassAlphaBottom: 0.65,
    glowColor: '#FFB86C',
    accentColor: '#FFE0B5',
    cloudOpacity: 0.85,
  },
  morning: {
    state: 'morning',
    badge: '🌤 MORNING',
    cloudCover: '42% Cloud Cover',
    bg: ['#154B94', '#3982C9', '#8CC3EB'],
    tempColor: '#FFE0A3',
    tempAlpha: 0.20,
    colorTemp: 0.35,
    vignetteHex: '#0A2044',
    vignetteAlphas: [0.16, 0.18, 0.56],
    glassTintHex: '#122D56',
    glassAlphaTop: 0.44,
    glassAlphaBottom: 0.64,
    glowColor: '#FFD27D',
    accentColor: '#FFE8BA',
    cloudOpacity: 0.85,
  },
  'high-sun': {
    state: 'high-sun',
    badge: '☀️ MIDDAY',
    cloudCover: '48% Cloud Cover',
    bg: ['#0B3E8A', '#1E70C7', '#5CA9F2'],
    tempColor: '#80D0FF',
    tempAlpha: 0.22,
    colorTemp: 0.0,
    vignetteHex: '#071C40',
    vignetteAlphas: [0.16, 0.20, 0.58],
    glassTintHex: '#0F2A54',
    glassAlphaTop: 0.46,
    glassAlphaBottom: 0.66,
    glowColor: '#7CC4FF',
    accentColor: '#D6EEFF',
    cloudOpacity: 0.92,
  },
  afternoon: {
    state: 'afternoon',
    badge: '☀️ AFTERNOON',
    cloudCover: '52% Cloud Cover',
    bg: ['#12468E', '#2F7BC4', '#7AB4E8'],
    tempColor: '#FFE2B0',
    tempAlpha: 0.20,
    colorTemp: 0.25,
    vignetteHex: '#091E40',
    vignetteAlphas: [0.18, 0.20, 0.58],
    glassTintHex: '#132C54',
    glassAlphaTop: 0.46,
    glassAlphaBottom: 0.66,
    glowColor: '#6FB3F2',
    accentColor: '#CBE6FF',
    cloudOpacity: 0.9,
  },
  'golden-hour': {
    state: 'golden-hour',
    badge: '🌤 GOLDEN HOUR',
    cloudCover: '45% Cloud Cover',
    bg: ['#24355E', '#9E5E5B', '#F09D58'],
    tempColor: '#FF9E44',
    tempAlpha: 0.36,
    colorTemp: 1.0,
    vignetteHex: '#161124',
    vignetteAlphas: [0.22, 0.22, 0.64],
    glassTintHex: '#30203A',
    glassAlphaTop: 0.48,
    glassAlphaBottom: 0.68,
    glowColor: '#FFB347',
    accentColor: '#FFDA9E',
    cloudOpacity: 0.88,
  },
  sunset: {
    state: 'sunset',
    badge: '🌇 SUNSET',
    cloudCover: '40% Cloud Cover',
    bg: ['#1B1E4B', '#873A62', '#E36D4E'],
    tempColor: '#FF6E4A',
    tempAlpha: 0.34,
    colorTemp: 0.85,
    vignetteHex: '#110B22',
    vignetteAlphas: [0.25, 0.24, 0.66],
    glassTintHex: '#281A3E',
    glassAlphaTop: 0.48,
    glassAlphaBottom: 0.68,
    glowColor: '#FF7A59',
    accentColor: '#FFC2AD',
    cloudOpacity: 0.88,
  },
  dusk: {
    state: 'dusk',
    badge: '🌆 DUSK',
    cloudCover: '30% Cloud Cover',
    bg: ['#0B102E', '#25214D', '#593766'],
    tempColor: '#9E54D4',
    tempAlpha: 0.24,
    colorTemp: -0.35,
    vignetteHex: '#060718',
    vignetteAlphas: [0.28, 0.25, 0.68],
    glassTintHex: '#18163A',
    glassAlphaTop: 0.48,
    glassAlphaBottom: 0.68,
    glowColor: '#C468FB',
    accentColor: '#E5C4FF',
    cloudOpacity: 0.82,
  },
};

function interpolateAnchors(a: AnchorPalette, b: AnchorPalette, rawT: number): AnchorPalette {
  const t = smoothstep(rawT);
  return {
    state: t < 0.5 ? a.state : b.state,
    badge: t < 0.5 ? a.badge : b.badge,
    cloudCover: t < 0.5 ? a.cloudCover : b.cloudCover,
    bg: [
      lerpHex(a.bg[0], b.bg[0], t),
      lerpHex(a.bg[1], b.bg[1], t),
      lerpHex(a.bg[2], b.bg[2], t),
    ],
    tempColor: lerpHex(a.tempColor, b.tempColor, t),
    tempAlpha: lerp(a.tempAlpha, b.tempAlpha, t),
    colorTemp: lerp(a.colorTemp, b.colorTemp, t),
    vignetteHex: lerpHex(a.vignetteHex, b.vignetteHex, t),
    vignetteAlphas: [
      lerp(a.vignetteAlphas[0], b.vignetteAlphas[0], t),
      lerp(a.vignetteAlphas[1], b.vignetteAlphas[1], t),
      lerp(a.vignetteAlphas[2], b.vignetteAlphas[2], t),
    ],
    glassTintHex: lerpHex(a.glassTintHex, b.glassTintHex, t),
    glassAlphaTop: lerp(a.glassAlphaTop, b.glassAlphaTop, t),
    glassAlphaBottom: lerp(a.glassAlphaBottom, b.glassAlphaBottom, t),
    glowColor: lerpHex(a.glowColor, b.glowColor, t),
    accentColor: lerpHex(a.accentColor, b.accentColor, t),
    cloudOpacity: lerp(a.cloudOpacity, b.cloudOpacity, t),
  };
}

function resolveInterpolatedPalette(iso: string, sun: SunTimes): AnchorPalette {
  const { minutes: m, rise, set, noon } = keyframes(iso, sun);
  const stops: { at: number; anchor: AnchorPalette }[] = [
    { at: 0, anchor: ANCHORS.night },
    { at: rise - 50, anchor: ANCHORS.night },
    { at: rise - 15, anchor: ANCHORS.dawn },
    { at: rise + 25, anchor: ANCHORS.sunrise },
    { at: rise + 110, anchor: ANCHORS.morning },
    { at: noon, anchor: ANCHORS['high-sun'] },
    { at: set - 120, anchor: ANCHORS.afternoon },
    { at: set - 35, anchor: ANCHORS['golden-hour'] },
    { at: set + 5, anchor: ANCHORS.sunset },
    { at: set + 35, anchor: ANCHORS.dusk },
    { at: set + 75, anchor: ANCHORS.night },
    { at: 24 * 60, anchor: ANCHORS.night },
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const cur = stops[i];
    const next = stops[i + 1];
    if (m >= cur.at && m <= next.at) {
      const span = Math.max(1, next.at - cur.at);
      return interpolateAnchors(cur.anchor, next.anchor, (m - cur.at) / span);
    }
  }
  return ANCHORS.night;
}

const LIGHT_TEXT = {
  primary: '#FFFFFF',
  secondary: 'rgba(255, 255, 255, 0.88)',
  muted: 'rgba(255, 255, 255, 0.68)',
};

/** Smoothly interpolated sky theme and high-contrast glassmorphism tokens for a given moment. */
export function getHourTheme(iso: string, sun: SunTimes = {}): HourTheme {
  const solar = getSolarState(iso, sun);
  const p = resolveInterpolatedPalette(iso, sun);

  return {
    block: getTimeBlock(iso, sun),
    solar,
    isDay: solar !== 'night',
    sunElevation: getSunElevation(iso, sun),
    colorTemp: p.colorTemp,
    badge: p.badge,
    cloudCover: p.cloudCover,
    bgGradient: p.bg,
    tempWashGradient: [
      hexToRgba(p.tempColor, p.colorTemp < 0 ? p.tempAlpha : p.tempAlpha * 0.25),
      hexToRgba(p.tempColor, p.tempAlpha * 0.45),
      hexToRgba(p.tempColor, p.colorTemp >= 0 ? p.tempAlpha : p.tempAlpha * 0.2),
    ],
    overlayGradient: [
      hexToRgba(p.vignetteHex, p.vignetteAlphas[0]),
      hexToRgba(p.vignetteHex, p.vignetteAlphas[1]),
      hexToRgba(p.vignetteHex, p.vignetteAlphas[2]),
    ],
    liquidCardTint: [
      hexToRgba(p.glassTintHex, p.glassAlphaTop),
      hexToRgba(p.glassTintHex, p.glassAlphaBottom),
    ],
    glowColor: p.glowColor,
    cloudOpacity: p.cloudOpacity,
    text: { ...LIGHT_TEXT, accent: p.accentColor },
    surface: {
      card: hexToRgba(p.glassTintHex, 0.52),
      cardSelected: hexToRgba(p.glowColor, 0.34),
      border: 'rgba(255, 255, 255, 0.22)',
      borderSelected: 'rgba(255, 255, 255, 0.78)',
      headerScrim: hexToRgba(p.vignetteHex, 0.38),
    },
  };
}

// --- Icons ----------------------------------------------------------------------------

export const BLOCK_LABELS: Record<TimeBlock, string> = {
  'early-morning': 'Early Morning',
  'late-morning': 'Late Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

export function weatherGlyph(code: number, iso: string, sun: SunTimes = {}): string {
  const solar = getSolarState(iso, sun);
  const night = solar === 'night';

  if (code >= 95) return '⛈️';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if (code >= 71 && code <= 86) return '❄️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code === 3) return '☁️';
  if (code === 2) return night ? '☁️' : '⛅';

  if (night) return getMoonPhase(iso).glyph;
  switch (solar) {
    case 'dawn':
      return '🌄';
    case 'sunrise':
      return '🌅';
    case 'sunset':
      return '🌇';
    case 'dusk':
      return '🌆';
    case 'golden-hour':
      return '🌤️';
    default:
      return '☀️';
  }
}

export function formatHourLabel(iso: string, isNow = false): string {
  if (isNow) return 'Now';
  const h = parseInt(iso.slice(11, 13), 10);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}
