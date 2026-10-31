import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Mask,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { phased, seeded, useLoop, useParticles } from './animation';

// ============================================================================
// 1. PROCEDURAL FRACTAL NOISE (2D PERLIN / SIMPLEX GRADIENT + 5-OCTAVE fBm)
// ============================================================================

/**
 * Permutation table & 12-direction gradient vectors for fast, deterministic
 * 2D gradient noise used to synthesize volumetric cloud density fields.
 */
const PERM = new Uint8Array(512);
const GRADS: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

(() => {
  const rand = seeded(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
  }
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Single-octave 2D Perlin gradient noise mapped to [-1, 1]. */
export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X] + Y] % 12;
  const ab = PERM[PERM[X] + Y + 1] % 12;
  const ba = PERM[PERM[X + 1] + Y] % 12;
  const bb = PERM[PERM[X + 1] + Y + 1] % 12;

  const dotAA = GRADS[aa][0] * xf + GRADS[aa][1] * yf;
  const dotBA = GRADS[ba][0] * (xf - 1) + GRADS[ba][1] * yf;
  const dotAB = GRADS[ab][0] * xf + GRADS[ab][1] * (yf - 1);
  const dotBB = GRADS[bb][0] * (xf - 1) + GRADS[bb][1] * (yf - 1);

  return lerp(lerp(dotAA, dotBA, u), lerp(dotAB, dotBB, u), v);
}

/**
 * Multi-octave Fractional Brownian Motion (fBm).
 * Sums `octaves` of 2D gradient noise with lacunarity = 2.03 and gain = 0.5
 * (rotated between octaves to eliminate axis-aligned grid artifacts), normalized to [0, 1].
 */
export function fbm2D(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  // Rotate octave coordinates by ~37 deg (cos=0.8, sin=0.6) to break axial alignment
  let rx = x;
  let ry = y;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise2D(rx * freq, ry * freq);
    norm += amp;
    const nx = rx * 0.8 - ry * 0.6;
    const ny = rx * 0.6 + ry * 0.8;
    rx = nx;
    ry = ny;
    freq *= 2.03;
    amp *= 0.5;
  }
  return clamp01(0.5 + (value / norm) * 0.68);
}

/**
 * Domain-warped fBm: warps input coordinates by a secondary fBm vector field
 * to produce billowing cumulus cauliflower edges and sheared cirrus filaments.
 */
export function warpedFbm(x: number, y: number, warpStrength = 0.65, octaves = 5): number {
  const qx = fbm2D(x + 1.7, y + 9.2, 3) - 0.5;
  const qy = fbm2D(x + 8.3, y + 2.8, 3) - 0.5;
  return fbm2D(x + qx * warpStrength * 2.4, y + qy * warpStrength * 2.4, octaves);
}

// ============================================================================
// 2. VOLUMETRIC LIGHT SCATTERING (HENYEY-GREENSTEIN + BEER-LAMBERT + BOUNCE)
// ============================================================================

export interface VolumetricCloudProps {
  /** Layer master opacity (0..1 Animated.Value). */
  opacity: Animated.Value;
  /** Cloud cover / density (0..1). */
  cover: number;
  /** Normalised wind speed (0 calm .. 1 gale). */
  wind: number;
  /** Horizontal wind direction (1 = left->right, -1 = right->left). */
  windDir: 1 | -1;
  /** Wind compass angle in degrees (optional, used for upper-air shear). */
  windAngleDeg?: number;
  /** Lit cloud highlight hex color. */
  light: string;
  /** Shadowed cloud base hex color. */
  shade: string;
  /** Sun elevation (0 at horizon/night .. 1 at solar noon). */
  sunElevation?: number;
  /** Color temperature (-1 cool deep night .. +1 warm golden hour). */
  colorTemp?: number;
  /** Storm / thunderstorm intensity (0..1) for nimbostratus darkening + lightning pulses. */
  storm?: number;
  /** Base cloud cluster count. */
  count: number;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
};

const rgbToCss = (rgb: [number, number, number], alpha = 1) =>
  `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${clamp01(alpha).toFixed(3)})`;

const lerpRgb = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/**
 * Henyey-Greenstein phase function: models strong forward scattering (silver lining)
 * when light passes through thin cloud fringes at grazing angles.
 * `g` in [0.55, 0.75] produces characteristic silver-lining rim glow.
 */
export function henyeyGreenstein(cosTheta: number, g = 0.62): number {
  const g2 = g * g;
  const denom = Math.pow(1 + g2 - 2 * g * cosTheta, 1.5);
  return (1 - g2) / (4 * Math.PI * Math.max(0.001, denom));
}

/**
 * Beer-Lambert-Powder transmittance model (Schneider / Guerrilla Games Nubis model):
 * combines exponential optical-depth attenuation exp(-tau) with the "powder sugar"
 * dark-edge-to-bright-rim term (1 - exp(-2 * tau)).
 */
export function beerPowderEnergy(opticalDepth: number, cosTheta: number): number {
  const beer = Math.exp(-opticalDepth);
  const powder = 1 - Math.exp(-opticalDepth * 2.1);
  const phase = henyeyGreenstein(cosTheta, 0.62);
  return 2.0 * beer * powder * (0.45 + 0.55 * phase);
}

interface VolumetricPalette {
  /** High-intensity rim / silver lining RGB (golden at sunset, crisp white at noon, indigo-silver at night) */
  rimRgb: [number, number, number];
  /** Primary lit cloud body RGB */
  litRgb: [number, number, number];
  /** Mid-tone internal fold RGB */
  midRgb: [number, number, number];
  /** Self-shadowed ambient occlusion base RGB tinted with sky bounce light */
  aoBounceRgb: [number, number, number];
  /** Deep storm core RGB for nimbostratus/mammatus clouds */
  stormCoreRgb: [number, number, number];
}

function computeVolumetricPalette(
  lightHex: string,
  shadeHex: string,
  sunElevation: number,
  colorTemp: number,
  storm: number,
): VolumetricPalette {
  const lightRgb = hexToRgb(lightHex);
  const shadeRgb = hexToRgb(shadeHex);

  // 1. Subsurface Rim / Silver-Lining Color:
  // Warm golden-amber at golden hour / dawn, pure white at midday, moonlit silver-indigo at night
  const warmFactor = clamp01(colorTemp);
  const nightFactor = clamp01(-colorTemp);
  const dayRim: [number, number, number] = lerpRgb([255, 255, 255], [255, 218, 158], warmFactor * 0.85);
  const rimRgb: [number, number, number] = lerpRgb(dayRim, [186, 208, 255], nightFactor * 0.78);

  // 2. Sky Bounce Light for Self-Shadowing & Ambient Occlusion:
  // Prevents undersides from turning muddy black by tinting with cool slate-blue (day) or dusty lavender (dusk/dawn)
  const dayBounce: [number, number, number] = [94, 124, 168]; // cool atmospheric slate blue
  const duskBounce: [number, number, number] = [112, 82, 134]; // dusty twilight lavender
  const nightBounce: [number, number, number] = [26, 36, 68]; // deep lunar indigo
  const bounceBase = lerpRgb(
    lerpRgb(dayBounce, duskBounce, warmFactor * 0.85),
    nightBounce,
    nightFactor,
  );
  const aoBounceRgb = lerpRgb(shadeRgb, bounceBase, 0.42);

  // 3. Storm / Nimbostratus Darkening:
  const stormUnder: [number, number, number] = [24, 30, 46];
  const litRgb = lerpRgb(lightRgb, [76, 86, 110], storm * 0.72);
  const midRgb = lerpRgb(lerpRgb(lightRgb, shadeRgb, 0.52), [44, 52, 74], storm * 0.75);
  const finalAo = lerpRgb(aoBounceRgb, stormUnder, storm * 0.82);

  return {
    rimRgb,
    litRgb,
    midRgb,
    aoBounceRgb: finalAo,
    stormCoreRgb: stormUnder,
  };
}

// ============================================================================
// 3. OFFSCREEN CANVAS VOLUMETRIC PUFF ATLAS (WEB 60 FPS HARDWARE PATH)
// ============================================================================

type PuffArchetype = 'cirrus' | 'altocumulus' | 'stratocumulus' | 'mammatus';

interface SubLobe {
  ox: number;
  oy: number;
  rx: number;
  ry: number;
  density: number;
}

/**
 * Generates an offscreen `HTMLCanvasElement` containing a pre-lit, fBm-sculpted
 * volumetric cloud puff sprite. During the 60 FPS animation loop, these sprites
 * are blitted with `ctx.drawImage()` and deformed slightly over time.
 */
function createOffscreenPuffSprite(
  archetype: PuffArchetype,
  seed: number,
  palette: VolumetricPalette,
  sunElevation: number,
  storm: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const size = archetype === 'cirrus' ? 220 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size * (archetype === 'cirrus' ? 0.42 : 0.66));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const r = seeded(seed);

  // Sun vector: higher sun illuminates from top-right; low sun illuminates rims from horizon side
  const sunDirX = 0.38;
  const sunDirY = -0.35 - 0.55 * sunElevation;

  if (archetype === 'cirrus') {
    // High-altitude sheared cirrus streaks using elongated anisotropic radial washes + fBm offsets
    const strands = 9;
    for (let i = 0; i < strands; i++) {
      const fx = 0.18 + (i / strands) * 0.64 + (r() - 0.5) * 0.08;
      const fy = 0.35 + (noise2D(i * 0.9 + seed, seed * 0.3) * 0.5 + 0.5) * 0.3;
      const rx = w * (0.22 + r() * 0.22);
      const ry = h * (0.08 + r() * 0.11);

      ctx.save();
      ctx.translate(w * fx, h * fy);
      ctx.rotate((r() - 0.5) * 0.14);
      ctx.scale(1, ry / rx);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, rgbToCss(palette.rimRgb, 0.26 * (1 - storm * 0.5)));
      grad.addColorStop(0.45, rgbToCss(palette.litRgb, 0.14));
      grad.addColorStop(1, rgbToCss(palette.litRgb, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return canvas;
  }

  // Build organic cumulus/stratocumulus/mammatus silhouette from fBm-perturbed sub-lobes:
  // Higher lobes form the cauliflower crown; lower lobes form the flat/undulating condensation base.
  const lobeCount = archetype === 'mammatus' ? 22 : 18;
  const lobes: SubLobe[] = [];

  for (let i = 0; i < lobeCount; i++) {
    const t = i / (lobeCount - 1);
    const angle = t * Math.PI * 2;
    const fbmVal = warpedFbm(Math.cos(angle) * 1.3 + seed * 0.1, Math.sin(angle) * 1.3 + seed * 0.2, 0.6, 4);
    const ring = i < 5 ? 0.12 * r() : 0.22 + 0.2 * fbmVal;
    const ox = (t - 0.5) * 0.62 + (r() - 0.5) * 0.14;
    // Flatten underside for cumulus/stratocumulus; droop pouches downward for storm mammatus
    const rawOy = Math.sin(angle) * ring * 0.85;
    const oy =
      archetype === 'mammatus'
        ? rawOy * 0.9 + 0.05
        : rawOy > 0.08
          ? 0.08 + (rawOy - 0.08) * 0.32
          : rawOy;
    const radiusScale = 0.18 + 0.16 * fbmVal * (1 - Math.abs(ox) * 0.55);
    lobes.push({
      ox,
      oy,
      rx: w * radiusScale * (archetype === 'stratocumulus' ? 1.25 : 1.0),
      ry: h * radiusScale * (archetype === 'stratocumulus' ? 0.95 : 1.12),
      density: clamp01(0.55 + 0.45 * fbmVal),
    });
  }

  // Sort back-to-front (top-to-bottom so undersides & AO folds self-shadow naturally)
  lobes.sort((a, b) => a.oy - b.oy);

  // Pass 1: Subsurface Rim / Silver-Lining Halo on sun-facing crown edges
  for (const lobe of lobes) {
    const cx = w * (0.5 + lobe.ox);
    const cy = h * (0.52 + lobe.oy);
    // Cosine between lobe normal and sun vector drives Henyey-Greenstein forward scatter
    const normLen = Math.hypot(lobe.ox, lobe.oy - 0.08) || 1;
    const cosTheta = clamp01((lobe.ox * sunDirX + (lobe.oy - 0.08) * sunDirY) / normLen);
    const scatter = beerPowderEnergy(lobe.density * 1.4, cosTheta);

    if (lobe.oy <= 0.06) {
      ctx.save();
      ctx.translate(cx + sunDirX * 5, cy + sunDirY * 5);
      ctx.scale(1, lobe.ry / lobe.rx);
      const rimRadius = lobe.rx * 1.12;
      const rimGrad = ctx.createRadialGradient(0, 0, lobe.rx * 0.15, 0, 0, rimRadius);
      const rimAlpha = clamp01((0.28 + 0.34 * scatter) * (1 - storm * 0.35));
      rimGrad.addColorStop(0, rgbToCss(palette.rimRgb, rimAlpha));
      rimGrad.addColorStop(0.55, rgbToCss(palette.rimRgb, rimAlpha * 0.48));
      rimGrad.addColorStop(1, rgbToCss(palette.rimRgb, 0));
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(0, 0, rimRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Pass 2: Volumetric Core + Internal Folds + Sky-Bounce Ambient Occlusion Undersides
  for (const lobe of lobes) {
    const cx = w * (0.5 + lobe.ox);
    const cy = h * (0.52 + lobe.oy);
    // Vertical height fraction within cloud: 0 = crown (sunlit), 1 = base (AO + sky bounce)
    const verticalAo = smoothstep(-0.22, 0.22, lobe.oy);
    const coreRgb = lerpRgb(palette.litRgb, palette.aoBounceRgb, verticalAo * 0.85);
    const foldRgb = lerpRgb(palette.midRgb, palette.stormCoreRgb, storm * 0.65 + verticalAo * 0.35);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, lobe.ry / lobe.rx);

    // Offset gradient focal point toward the sun for 3D spherical volume
    const focalX = sunDirX * lobe.rx * 0.28;
    const focalY = sunDirY * lobe.rx * 0.28;
    const grad = ctx.createRadialGradient(focalX, focalY, lobe.rx * 0.05, 0, 0, lobe.rx);

    const alphaCore = clamp01(lobe.density * (0.52 + storm * 0.24));
    grad.addColorStop(0, rgbToCss(coreRgb, alphaCore));
    grad.addColorStop(0.48, rgbToCss(foldRgb, alphaCore * 0.72));
    grad.addColorStop(0.78, rgbToCss(palette.aoBounceRgb, alphaCore * 0.32));
    grad.addColorStop(1, rgbToCss(palette.aoBounceRgb, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, lobe.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return canvas;
}

// ============================================================================
// 4. MULTI-PLANE PARALLAX CLOUD DEFINITIONS (3 DEPTH PLANES + EDGE DEFORMATION)
// ============================================================================

type DepthPlane = 0 | 1 | 2; // 0 = High Cirrus, 1 = Mid Altocumulus, 2 = Low Stratocumulus

interface CloudNodeLobe {
  spriteIdx: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  phaseOffset: number;
  deformAmp: number;
}

interface CloudCluster {
  plane: DepthPlane;
  archetype: PuffArchetype;
  baseX: number; // 0..1 normalized horizontal start
  baseY: number; // 0..1 normalized vertical position in upper sky
  width: number;
  height: number;
  speedMul: number;
  alpha: number;
  lobes: CloudNodeLobe[];
}

function buildCloudClusters(count: number, W: number, H: number, storm: number): CloudCluster[] {
  const r = seeded(901);
  const clusters: CloudCluster[] = [];

  // Plane 0: High-Altitude Cirrus (slow, wispy, upper sky)
  const cirrusCount = Math.max(3, Math.round(count * 0.45));
  for (let i = 0; i < cirrusCount; i++) {
    const w = W * (0.48 + r() * 0.42);
    const h = w * 0.32;
    clusters.push({
      plane: 0,
      archetype: 'cirrus',
      baseX: (i / cirrusCount + r() * 0.15) % 1,
      baseY: H * (0.01 + r() * 0.16),
      width: w,
      height: h,
      speedMul: 0.22 + r() * 0.08,
      alpha: 0.45 + r() * 0.35,
      lobes: [
        { spriteIdx: i % 2, dx: 0, dy: 0, scaleX: 1, scaleY: 1, phaseOffset: r() * 6.28, deformAmp: 0.04 },
        { spriteIdx: (i + 1) % 2, dx: w * 0.22, dy: -h * 0.08, scaleX: 0.85, scaleY: 0.75, phaseOffset: r() * 6.28, deformAmp: 0.05 },
      ],
    });
  }

  // Plane 1: Mid-Ground Altocumulus / Cumulus (primary volumetric masses, medium speed, internal turbulence)
  const midCount = Math.max(4, count);
  for (let i = 0; i < midCount; i++) {
    const w = W * (0.46 + r() * 0.44);
    const h = w * 0.56;
    const isMammatus = storm > 0.45 && i % 2 === 0;
    const subLobes: CloudNodeLobe[] = Array.from({ length: 3 }, (_, l) => ({
      spriteIdx: (i + l) % 3,
      dx: (l - 1) * w * 0.24 + (r() - 0.5) * w * 0.06,
      dy: (l === 1 ? -0.06 : 0.04) * h + (r() - 0.5) * h * 0.04,
      scaleX: l === 1 ? 1.08 : 0.86 + r() * 0.18,
      scaleY: l === 1 ? 1.05 : 0.84 + r() * 0.16,
      phaseOffset: r() * Math.PI * 2,
      deformAmp: 0.06 + r() * 0.04,
    }));
    clusters.push({
      plane: 1,
      archetype: isMammatus ? 'mammatus' : 'altocumulus',
      baseX: (i / midCount + r() * 0.12) % 1,
      baseY: H * (0.02 + r() * 0.22),
      width: w,
      height: h,
      speedMul: 0.54 + r() * 0.18,
      alpha: 0.68 + r() * 0.28,
      lobes: subLobes,
    });
  }

  // Plane 2: Foreground / Low-Altitude Stratocumulus (fast, broad, pronounced motion stretch)
  const lowCount = Math.max(3, Math.round(count * 0.55));
  for (let i = 0; i < lowCount; i++) {
    const w = W * (0.58 + r() * 0.48);
    const h = w * 0.5;
    clusters.push({
      plane: 2,
      archetype: 'stratocumulus',
      baseX: (i / lowCount + r() * 0.18) % 1,
      baseY: H * (0.08 + r() * 0.24),
      width: w,
      height: h,
      speedMul: 0.92 + r() * 0.22,
      alpha: 0.74 + r() * 0.24,
      lobes: [
        { spriteIdx: i % 2, dx: -w * 0.18, dy: h * 0.03, scaleX: 1.05, scaleY: 0.9, phaseOffset: r() * 6.28, deformAmp: 0.07 },
        { spriteIdx: (i + 1) % 2, dx: w * 0.16, dy: 0, scaleX: 1.12, scaleY: 0.94, phaseOffset: r() * 6.28, deformAmp: 0.08 },
      ],
    });
  }

  return clusters;
}

// ============================================================================
// 5. WEB HTML5 CANVAS 2D VOLUMETRIC RENDERER (OFFSCREEN BLIT + 60 FPS LOOP)
// ============================================================================

function WebVolumetricCloudCanvas({
  cover,
  wind,
  windDir,
  light,
  shade,
  sunElevation = 0.6,
  colorTemp = 0,
  storm = 0,
  count,
}: Omit<VolumetricCloudProps, 'opacity'>) {
  const { width: W, height: H } = useWindowDimensions();
  const hostRef = useRef<React.ComponentRef<typeof View> | null>(null);

  // Keep live dynamic props in a ref so the 60 FPS RAF loop reads wind/cover without tearing down the canvas
  const livePropsRef = useRef({ cover, wind, windDir, storm, sunElevation });
  useEffect(() => {
    livePropsRef.current = { cover, wind, windDir, storm, sunElevation };
  }, [cover, wind, windDir, storm, sunElevation]);

  const palette = useMemo(
    () => computeVolumetricPalette(light, shade, sunElevation, colorTemp, storm),
    [light, shade, sunElevation, colorTemp, storm],
  );

  const clusters = useMemo(
    () => buildCloudClusters(count, Math.max(320, W), Math.max(480, H), storm),
    [count, W, H, storm],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const hostNode = hostRef.current as unknown as HTMLElement | null;
    if (!hostNode || typeof hostNode.appendChild !== 'function') return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const cw = Math.max(1, Math.round(W));
    const ch = Math.max(1, Math.round(H * 0.56)); // Cloud canopy covers upper 56% of viewport

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = '0px';
    canvas.style.pointerEvents = 'none';
    hostNode.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      hostNode.removeChild(canvas);
      return;
    }

    // Pre-render detached offscreen sprite atlas (2 cirrus, 3 altocumulus, 2 stratocumulus, 2 mammatus)
    const offscreenSprites: Record<PuffArchetype, HTMLCanvasElement[]> = {
      cirrus: [
        createOffscreenPuffSprite('cirrus', 101, palette, sunElevation, storm),
        createOffscreenPuffSprite('cirrus', 202, palette, sunElevation, storm),
      ].filter((c): c is HTMLCanvasElement => c !== null),
      altocumulus: [
        createOffscreenPuffSprite('altocumulus', 303, palette, sunElevation, storm),
        createOffscreenPuffSprite('altocumulus', 404, palette, sunElevation, storm),
        createOffscreenPuffSprite('altocumulus', 505, palette, sunElevation, storm),
      ].filter((c): c is HTMLCanvasElement => c !== null),
      stratocumulus: [
        createOffscreenPuffSprite('stratocumulus', 606, palette, sunElevation, storm),
        createOffscreenPuffSprite('stratocumulus', 707, palette, sunElevation, storm),
      ].filter((c): c is HTMLCanvasElement => c !== null),
      mammatus: [
        createOffscreenPuffSprite('mammatus', 808, palette, sunElevation, storm),
        createOffscreenPuffSprite('mammatus', 909, palette, sunElevation, storm),
      ].filter((c): c is HTMLCanvasElement => c !== null),
    };

    let rafId = 0;
    let lastTime = performance.now();
    let driftAccumulator = 0;
    let morphTime = 0;
    let lightningPulse = 0;
    let nextLightningAt = performance.now() + 2400 + Math.random() * 4200;

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const {
        cover: curCover,
        wind: curWind,
        windDir: curDir,
        storm: curStorm,
      } = livePropsRef.current;

      // Pixels per second base velocity scaled by active wind speed
      const baseSpeedPx = 14 + curWind * 58;
      driftAccumulator += dt * baseSpeedPx * curDir;
      morphTime += dt * (0.45 + curWind * 0.75);

      // Storm internal sheet-lightning illumination pulse
      if (curStorm > 0.15 && now >= nextLightningAt) {
        lightningPulse = 0.65 + Math.random() * 0.35;
        nextLightningAt = now + (2800 + Math.random() * 5500) / (0.6 + curStorm);
      }
      lightningPulse = Math.max(0, lightningPulse - dt * 3.2);

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // Upper-sky atmospheric zenith veil so cloud tops fuse with the sky gradient
      const veilGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.72);
      veilGrad.addColorStop(0, rgbToCss(palette.aoBounceRgb, 0.38 * curCover));
      veilGrad.addColorStop(0.55, rgbToCss(palette.midRgb, 0.16 * curCover));
      veilGrad.addColorStop(1, rgbToCss(palette.aoBounceRgb, 0));
      ctx.fillStyle = veilGrad;
      ctx.fillRect(0, 0, cw, ch * 0.72);

      const coverVis = clamp01(0.32 + curCover * 0.78);
      // Wind-velocity horizontal stretch & shear angle
      const lowAltitudeStretch = 1 + curWind * 0.24;
      const upperShear = curDir * (0.06 + curWind * 0.18);

      for (const cluster of clusters) {
        const sprites = offscreenSprites[cluster.archetype];
        if (!sprites || sprites.length === 0) continue;

        const spanW = cw + cluster.width * 1.6;
        const rawX = cluster.baseX * spanW + driftAccumulator * cluster.speedMul;
        const wrappedX = (((rawX % spanW) + spanW) % spanW) - cluster.width * 0.8;

        // Plane-specific atmospheric blending:
        // Plane 0 (Cirrus) uses 'screen' for translucent ice-crystal scatter;
        // Plane 1 & 2 use 'source-over' with a soft-light/screen rim pass
        ctx.globalCompositeOperation = cluster.plane === 0 ? 'screen' : 'source-over';

        for (const lobe of cluster.lobes) {
          const sprite = sprites[lobe.spriteIdx % sprites.length];
          // Continuous procedural edge deformation (subtle boiling/breathing over time)
          const phase = morphTime + lobe.phaseOffset;
          const breatheX = 1 + Math.sin(phase) * lobe.deformAmp;
          const breatheY = 1 + Math.cos(phase * 0.83) * lobe.deformAmp;
          const driftLobeY = Math.sin(phase * 0.62) * 6;

          const drawW =
            cluster.width *
            lobe.scaleX *
            breatheX *
            (cluster.plane === 2 ? lowAltitudeStretch : 1);
          const drawH = cluster.height * lobe.scaleY * breatheY;
          const cx = wrappedX + cluster.width * 0.5 + lobe.dx;
          const cy = cluster.baseY + cluster.height * 0.42 + lobe.dy + driftLobeY;

          ctx.save();
          ctx.translate(cx, cy);
          if (cluster.plane === 0) {
            ctx.transform(1, 0, upperShear, 1, 0, 0);
          }
          ctx.globalAlpha = clamp01(cluster.alpha * coverVis);
          ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);

          // Internal subsurface lightning illumination pulse during thunderstorms
          if (lightningPulse > 0.02 && cluster.plane >= 1) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = clamp01(lightningPulse * 0.42 * cluster.alpha);
            ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
          }
          ctx.restore();
        }
      }

      // Soft vertical dissipation mask so clouds fade out organically before reaching foreground UI
      ctx.globalCompositeOperation = 'destination-in';
      const maskGrad = ctx.createLinearGradient(0, 0, 0, ch);
      maskGrad.addColorStop(0, 'rgba(0,0,0,0.96)');
      maskGrad.addColorStop(0.62, 'rgba(0,0,0,0.88)');
      maskGrad.addColorStop(0.86, 'rgba(0,0,0,0.32)');
      maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = maskGrad;
      ctx.fillRect(0, 0, cw, ch);

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    // Complete cleanup on unmount or dimension/palette change
    return () => {
      cancelAnimationFrame(rafId);
      Object.values(offscreenSprites).forEach((list) =>
        list.forEach((s) => {
          s.width = 0;
          s.height = 0;
        }),
      );
      canvas.width = 0;
      canvas.height = 0;
      if (canvas.parentNode === hostNode) {
        hostNode.removeChild(canvas);
      }
    };
  }, [W, H, palette, clusters, sunElevation, storm]);

  return <View ref={hostRef} pointerEvents="none" style={StyleSheet.absoluteFill} />;
}

// ============================================================================
// 6. NATIVE iOS / ANDROID VOLUMETRIC SVG FALLBACK (fBm LOBES + RADIAL SCATTER)
// ============================================================================

function NativeVolumetricPuff({
  w,
  seed,
  plane,
  palette,
  storm,
}: {
  w: number;
  seed: number;
  plane: DepthPlane;
  palette: VolumetricPalette;
  storm: number;
}) {
  const h = w * (plane === 0 ? 0.36 : 0.56);
  const lobes = useMemo(() => {
    const r = seeded(seed);
    if (plane === 0) {
      return Array.from({ length: 5 }, (_, i) => ({
        cx: 35 + i * 32 + (r() - 0.5) * 12,
        cy: 45 + (r() - 0.5) * 16,
        rx: 42 + r() * 28,
        ry: 8 + r() * 6,
        ao: 0.15,
      }));
    }
    return Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const n = fbm2D(t * 2.4 + seed, seed * 0.37, 4);
      const isCrown = i >= 2 && i <= 6;
      return {
        cx: 28 + t * 144 + (r() - 0.5) * 12,
        cy: isCrown ? 38 + (1 - n) * 22 : 62 + (r() - 0.5) * 8,
        rx: (26 + n * 28) * (plane === 2 ? 1.15 : 1),
        ry: 22 + n * 24,
        ao: isCrown ? 0.15 : 0.78,
      };
    });
  }, [seed, plane]);

  const idPrefix = `vpuff-${plane}-${seed}`;
  const rimHex = rgbToCss(palette.rimRgb, 1);
  const litHex = rgbToCss(palette.litRgb, 1);
  const midHex = rgbToCss(palette.midRgb, 1);
  const aoHex = rgbToCss(palette.aoBounceRgb, 1);

  return (
    <Svg width={w} height={h} viewBox="0 0 200 110">
      <Defs>
        {/* Subsurface scattering silver-lining radial gradient */}
        <RadialGradient id={`${idPrefix}-crown`} cx="46%" cy="28%" r="62%">
          <Stop offset="0%" stopColor={rimHex} stopOpacity={0.92 - storm * 0.25} />
          <Stop offset="38%" stopColor={litHex} stopOpacity={0.82} />
          <Stop offset="76%" stopColor={midHex} stopOpacity={0.45} />
          <Stop offset="100%" stopColor={aoHex} stopOpacity={0} />
        </RadialGradient>
        {/* Self-shadowed sky-bounce ambient occlusion underside gradient */}
        <RadialGradient id={`${idPrefix}-base`} cx="50%" cy="42%" r="58%">
          <Stop offset="0%" stopColor={midHex} stopOpacity={0.78} />
          <Stop offset="58%" stopColor={aoHex} stopOpacity={0.62} />
          <Stop offset="100%" stopColor={aoHex} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <G>
        {lobes.map((l, idx) => (
          <Ellipse
            key={idx}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            fill={l.ao > 0.5 ? `url(#${idPrefix}-base)` : `url(#${idPrefix}-crown)`}
          />
        ))}
      </G>
    </Svg>
  );
}

function NativeVolumetricCloudLayer({
  cover,
  wind,
  windDir,
  light,
  shade,
  sunElevation = 0.6,
  colorTemp = 0,
  storm = 0,
  count,
}: Omit<VolumetricCloudProps, 'opacity'>) {
  const { width: W, height: H } = useWindowDimensions();
  const speed = 1 - 0.65 * wind;
  // 3 distinct parallax plane loops: Plane 0 (Cirrus), Plane 1 (Altocumulus), Plane 2 (Stratocumulus)
  const loopCirrus = useLoop(240000 * speed);
  const loopMid = useLoop(145000 * speed);
  const loopLow = useLoop(88000 * speed);
  const morphLoop = useLoop(9500, Easing.inOut(Easing.sin));
  const loops = [loopCirrus, loopMid, loopLow];

  const palette = useMemo(
    () => computeVolumetricPalette(light, shade, sunElevation, colorTemp, storm),
    [light, shade, sunElevation, colorTemp, storm],
  );

  const items = useParticles(count + 4, 73, (r, i) => {
    const plane: DepthPlane = i % 4 === 0 ? 0 : i % 3 === 0 ? 2 : 1;
    const wScale = plane === 0 ? 0.62 + r() * 0.35 : plane === 2 ? 0.68 + r() * 0.45 : 0.54 + r() * 0.42;
    return {
      plane,
      seed: 100 + i * 17,
      w: W * wScale,
      top:
        plane === 0
          ? H * (0.01 + r() * 0.14)
          : plane === 1
            ? H * (0.03 + r() * 0.22)
            : H * (0.08 + r() * 0.24),
      phase: (i / (count + 4) + r() * 0.12) % 1,
      alpha: (plane === 0 ? 0.52 : plane === 1 ? 0.78 : 0.86) * (0.7 + r() * 0.3),
      morphAmp: 4 + r() * 6,
    };
  });

  const morphScale = morphLoop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.96, 1.05, 0.96],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={W} height={H * 0.48} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="zenithCloudMask" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={rgbToCss(palette.aoBounceRgb, 1)} stopOpacity={0.48 * cover} />
            <Stop offset="100%" stopColor={rgbToCss(palette.aoBounceRgb, 1)} stopOpacity={0} />
          </SvgLinearGradient>
          <Circle id="dummy" r={1} />
          <Mask id="fadeMask">
            <Rect width={W} height={H * 0.48} fill="#fff" />
          </Mask>
        </Defs>
        <Rect width={W} height={H * 0.42} fill="url(#zenithCloudMask)" />
      </Svg>

      <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: windDir }] }]}>
        {items.map((c, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: c.top,
              opacity: c.alpha * Math.min(1, 0.35 + cover * 0.75),
              transform: [
                { translateX: phased(loops[c.plane], c.phase, -c.w, W) },
                { scaleX: morphScale },
              ],
            }}
          >
            <NativeVolumetricPuff
              w={c.w}
              seed={c.seed}
              plane={c.plane}
              palette={palette}
              storm={storm}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// 7. EXPORTED VOLUMETRIC CLOUD LAYER COMPONENT
// ============================================================================

export function VolumetricCloudLayer(props: VolumetricCloudProps) {
  const { opacity, ...rest } = props;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {Platform.OS === 'web' ? (
        <WebVolumetricCloudCanvas {...rest} />
      ) : (
        <NativeVolumetricCloudLayer {...rest} />
      )}
    </Animated.View>
  );
}
