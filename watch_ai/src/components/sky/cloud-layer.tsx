import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';
import { SolarState } from '../../lib/solar-theme';
import { phased, useLoop, useParticles } from './animation';

// ============================================================================
// 1. FRACTAL NOISE & VOLUMETRIC DENSITY MATH (Perlin/Value-Gradient + 5-Octave fBm)
// ============================================================================

/**
 * Fast deterministic 2D hash returning a pseudo-random gradient scalar in [0, 1].
 * Avoids lookup table allocation while remaining coherent across platforms.
 */
function hash2D(ix: number, iy: number, seed = 1337): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

/** Quintic Perlin fade curve: 6t^5 - 15t^4 + 10t^3 for C2-continuous derivatives. */
const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 2D smooth gradient-value noise in [0, 1].
 */
export function noise2D(x: number, y: number, seed = 1337): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = quintic(fx);
  const v = quintic(fy);

  const n00 = hash2D(ix, iy, seed);
  const n10 = hash2D(ix + 1, iy, seed);
  const n01 = hash2D(ix, iy + 1, seed);
  const n11 = hash2D(ix + 1, iy + 1, seed);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/**
 * Multi-Octave Fractional Brownian Motion (fBm).
 * Sums `octaves` of 2D noise with lacunarity = 2.02 and persistence (gain) = 0.5
 * to produce self-similar billowy cloud density fields.
 */
export function fbm2D(x: number, y: number, octaves = 5, seed = 1337): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency, seed + i * 97);
    norm += amplitude;
    frequency *= 2.02;
    amplitude *= 0.5;
  }
  return value / norm;
}

/**
 * Domain-warped fBm: fbm(p + fbm(p)) creates curling, turbulent cumulus & mammatus edges
 * rather than isotropic blobs.
 */
export function warpedFbm2D(x: number, y: number, octaves = 4, seed = 1337): number {
  const qx = fbm2D(x + 1.7, y + 9.2, 3, seed) - 0.5;
  const qy = fbm2D(x + 8.3, y + 2.8, 3, seed + 41) - 0.5;
  return fbm2D(x + 1.85 * qx, y + 1.85 * qy, octaves, seed + 113);
}

// ============================================================================
// 2. PHYSICALLY INSPIRED LIGHT SCATTERING & COLOUR HELPERS
// ============================================================================

export type RgbTuple = [number, number, number];

export function hexToRgb(hex: string): RgbTuple {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(f.slice(0, 2), 16),
    parseInt(f.slice(2, 4), 16),
    parseInt(f.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]: RgbTuple): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Henyey-Greenstein Phase Function:
 *   p(cosTheta, g) = (1 - g^2) / (4 * pi * (1 + g^2 - 2 * g * cosTheta)^(3/2))
 * Models strong forward scattering (silver-lining rim effect) in water-droplet aerosols
 * where anisotropy g ≈ 0.72. Normalized to [0, 1] for shader/canvas color mixing.
 */
export function henyeyGreensteinNormalized(cosTheta: number, g = 0.72): number {
  const g2 = g * g;
  const denom = Math.pow(Math.max(0.001, 1 + g2 - 2 * g * cosTheta), 1.5);
  const raw = (1 - g2) / denom;
  const maxForward = (1 - g2) / Math.pow(1 - g, 3);
  return Math.min(1, raw / maxForward);
}

export interface VolumetricPalette {
  /** Sun-facing subsurface scattering / silver-lining rim highlight. */
  rimLight: RgbTuple;
  /** Primary sunlit diffuse cloud body. */
  sunlitCore: RgbTuple;
  /** Mid-tone internal folds & ambient occlusion. */
  midOcclusion: RgbTuple;
  /** Cloud base shadow tinted with atmospheric sky bounce light (never muddy black). */
  bounceShadow: RgbTuple;
  /** Internal lightning scattering tint during storms. */
  lightningCore: RgbTuple;
  /** Normalized sun vector [sx, sy] in screen space. */
  sunDir: [number, number];
}

/**
 * Computes physically inspired volumetric scattering colors based on the active solar state,
 * sun elevation, rain density, and thunderstorm intensity.
 */
export function resolveVolumetricPalette(
  solar: SolarState,
  sunElevation: number,
  storm: number,
  rain: number,
): VolumetricPalette {
  let rimHex = '#ffffff';
  let coreHex = '#f3f7ff';
  let midHex = '#9bb0d1';
  let bounceHex = '#627ba6'; // cool slate-blue sky bounce

  switch (solar) {
    case 'dawn':
      rimHex = '#ffdfeb';
      coreHex = '#f5c2d1';
      midHex = '#8d658c';
      bounceHex = '#483863';
      break;
    case 'sunrise':
      rimHex = '#fff0c4';
      coreHex = '#ffd2ad';
      midHex = '#9c5f78';
      bounceHex = '#52385c';
      break;
    case 'morning':
      rimHex = '#fffdf2';
      coreHex = '#f7f9ff';
      midHex = '#9bb4d6';
      bounceHex = '#6684b0';
      break;
    case 'high-sun':
      rimHex = '#ffffff';
      coreHex = '#f8fbff';
      midHex = '#98b2d6';
      bounceHex = '#5e7ca8';
      break;
    case 'afternoon':
      rimHex = '#fffcf0';
      coreHex = '#f2f7ff';
      midHex = '#8fa9cf';
      bounceHex = '#58749e';
      break;
    case 'golden-hour':
      rimHex = '#ffe299';
      coreHex = '#ffc58c';
      midHex = '#995b63';
      bounceHex = '#543854';
      break;
    case 'sunset':
      rimHex = '#ffc285';
      coreHex = '#f59373';
      midHex = '#7d405e';
      bounceHex = '#3d2647';
      break;
    case 'dusk':
      rimHex = '#b8b0eb';
      coreHex = '#7268a1';
      midHex = '#433b6b';
      bounceHex = '#252142'; // dusty lavender/indigo bounce
      break;
    case 'night':
      rimHex = '#c8d8ff'; // moonlit silver-indigo rim
      coreHex = '#465380';
      midHex = '#283152';
      bounceHex = '#141930';
      break;
  }

  let rimLight = hexToRgb(rimHex);
  let sunlitCore = hexToRgb(coreHex);
  let midOcclusion = hexToRgb(midHex);
  let bounceShadow = hexToRgb(bounceHex);

  // Shift toward heavy nimbostratus / mammatus charcoal-indigo during rain & storms
  // while preserving sky-bounce chromaticity so undersides never turn flat black.
  const heavy = Math.min(1, storm * 0.85 + rain * 0.45);
  if (heavy > 0.01) {
    rimLight = lerpRgb(rimLight, [175, 192, 222], heavy * 0.65);
    sunlitCore = lerpRgb(sunlitCore, [82, 94, 122], heavy * 0.8);
    midOcclusion = lerpRgb(midOcclusion, [42, 49, 70], heavy * 0.88);
    bounceShadow = lerpRgb(bounceShadow, [22, 27, 44], heavy * 0.9);
  }

  // Sun direction vector: angled from upper-right during day, or upper-left moon at night
  const sx = solar === 'night' || solar === 'dusk' ? -0.55 : 0.62;
  const sy = -Math.max(0.35, sunElevation);
  const len = Math.hypot(sx, sy) || 1;

  return {
    rimLight,
    sunlitCore,
    midOcclusion,
    bounceShadow,
    lightningCore: [215, 228, 255],
    sunDir: [sx / len, sy / len],
  };
}

// ============================================================================
// 3. OFFSCREEN CANVAS VOLUMETRIC PUFF ATLAS (Web 60 FPS Hardware Acceleration)
// ============================================================================

type PlaneKind = 'cirrus' | 'altocumulus' | 'stratocumulus';

interface OffscreenPuffSprite {
  canvas: HTMLCanvasElement;
  kind: PlaneKind;
  width: number;
  height: number;
}

/**
 * Synthesizes a volumetric cloud puff texture onto a detached Offscreen HTMLCanvasElement.
 *
 * Physics & Noise Pipeline per texel (u, v):
 *  1. Compute radial falloff + domain-warped 5-octave fBm density field `d(u, v)`.
 *  2. Carve high-density billowy core and feathered wispy fringes via smoothstep thresholds.
 *  3. Estimate directional optical depth `tau` toward `sunDir` via finite-difference density
 *     sampling along the sun vector, then apply Beer-Lambert transmittance:
 *       T = exp(-extinction * tau) * (1 - exp(-2 * extinction * tau))  (powder-sugar effect)
 *  4. Combine Henyey-Greenstein silver-lining rim scattering on low-density sunlit fringes
 *     with vertical self-shadowing / ambient occlusion on the cloud underside.
 */
function buildVolumetricPuffSprite(
  kind: PlaneKind,
  seed: number,
  palette: VolumetricPalette,
  storm: number,
): OffscreenPuffSprite {
  // Coarse pixel grid upscaled smoothly by GPU drawImage filtering -> 60 FPS on mobile/laptop
  const width = kind === 'cirrus' ? 160 : 128;
  const height = kind === 'cirrus' ? 64 : 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, kind, width, height };

  const img = ctx.createImageData(width, height);
  const data = img.data;
  const [sx, sy] = palette.sunDir;
  const stepX = sx * 0.14;
  const stepY = sy * 0.14;

  const sampleDensity = (nx: number, ny: number): number => {
    // Elliptical envelope with flattened cumulus base for altocumulus/stratocumulus
    const dy = ny > 0 && kind !== 'cirrus' ? ny * 1.35 : ny;
    const dist = Math.sqrt(nx * nx + dy * dy);
    if (dist >= 1.0) return 0;

    const radialMask = Math.pow(1 - dist * dist, kind === 'cirrus' ? 1.8 : 1.35);
    const freq = kind === 'cirrus' ? 3.4 : kind === 'altocumulus' ? 2.5 : 2.1;
    const stretchX = kind === 'cirrus' ? 0.55 : 1.0;

    let n = warpedFbm2D((nx * stretchX + 1.5) * freq, (ny + 1.5) * freq, 4, seed);
    // Mammatus / nimbostratus bulbous underside pockets during storms
    if (storm > 0.2 && ny > 0.1) {
      const mammatus = Math.sin(nx * 9.0) * Math.cos(ny * 7.0) * 0.12 * storm;
      n += mammatus;
    }

    const raw = (n * 0.78 + 0.28) * radialMask;
    const edgeLow = kind === 'cirrus' ? 0.22 : 0.18;
    if (raw <= edgeLow) return 0;
    const norm = Math.min(1, (raw - edgeLow) / (0.72 - edgeLow));
    return norm * norm * (3 - 2 * norm);
  };

  for (let py = 0; py < height; py++) {
    const ny = (py / (height - 1)) * 2 - 1; // -1 (top) .. +1 (bottom)
    for (let px = 0; px < width; px++) {
      const nx = (px / (width - 1)) * 2 - 1; // -1 (left) .. +1 (right)
      const d = sampleDensity(nx, ny);
      if (d <= 0.004) continue;

      // Sample optical thickness toward the light source (2-step raymarch)
      const dSun1 = sampleDensity(nx + stepX, ny + stepY);
      const dSun2 = sampleDensity(nx + stepX * 2.2, ny + stepY * 2.2);
      const opticalDepth = (dSun1 * 0.6 + dSun2 * 0.4) * (kind === 'cirrus' ? 1.1 : 2.4);

      // Beer-Lambert transmittance + "powder effect" for dark interior / bright rims
      const beer = Math.exp(-opticalDepth);
      const powder = 1.0 - Math.exp(-opticalDepth * 2.2) * 0.45;
      const lightEnergy = Math.min(1, beer * powder);

      // Subsurface silver-lining rim boost on thin sunlit outer fringes
      const cosTheta = Math.max(0, -(nx * sx + ny * sy));
      const hgPhase = henyeyGreensteinNormalized(cosTheta, 0.68);
      const rimFactor = Math.pow(1 - d, 1.35) * beer * (0.45 + 0.55 * hgPhase);

      // Vertical ambient occlusion & self-shadowing (darker toward cloud base ny -> +1)
      const verticalAo = Math.min(1, Math.max(0, (ny + 0.55) / 1.45));
      const shadowMix = Math.min(1, verticalAo * 0.65 + (1 - lightEnergy) * 0.55);

      // 3-way color blend: bounceShadow -> midOcclusion -> sunlitCore -> rimLight
      const baseAndMid = lerpRgb(palette.midOcclusion, palette.bounceShadow, shadowMix);
      const litColor = lerpRgb(baseAndMid, palette.sunlitCore, lightEnergy);
      const finalRgb = lerpRgb(litColor, palette.rimLight, Math.min(1, rimFactor * 0.95));

      const alphaScale = kind === 'cirrus' ? 0.52 : kind === 'altocumulus' ? 0.88 : 0.94;
      const alpha = Math.min(1, Math.pow(d, 0.85) * alphaScale);

      const idx = (py * width + px) * 4;
      data[idx] = Math.round(finalRgb[0]);
      data[idx + 1] = Math.round(finalRgb[1]);
      data[idx + 2] = Math.round(finalRgb[2]);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, kind, width, height };
}

// ============================================================================
// 4. MULTI-PLANE PARALLAX CLOUD ENTITIES
// ============================================================================

interface PuffSubNode {
  ox: number; // normalized offset X (-0.4 .. 0.4 of cloud width)
  oy: number; // normalized offset Y
  scaleW: number;
  scaleH: number;
  spriteIdx: number;
  morphPhase: number;
  morphSpeed: number;
  alpha: number;
}

interface CloudCluster {
  plane: 0 | 1 | 2; // 0 = Cirrus (high), 1 = Altocumulus (mid), 2 = Stratocumulus (low)
  baseW: number; // relative to screen width
  baseH: number;
  topFrac: number; // vertical anchor fraction of screen height
  phase: number; // initial horizontal progress [0..1]
  speedMult: number;
  opacity: number;
  subPuffs: PuffSubNode[];
}

function generateCloudClusters(seed = 701): CloudCluster[] {
  const clusters: CloudCluster[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Plane 0: High-Altitude Cirrus (very slow, wispy, sheared filaments)
  for (let i = 0; i < 4; i++) {
    const subPuffs: PuffSubNode[] = Array.from({ length: 3 }, (_, j) => ({
      ox: (j - 1) * 0.24 + (rand() - 0.5) * 0.08,
      oy: (rand() - 0.5) * 0.08,
      scaleW: 0.65 + rand() * 0.45,
      scaleH: 0.4 + rand() * 0.25,
      spriteIdx: j % 2,
      morphPhase: rand() * Math.PI * 2,
      morphSpeed: 0.25 + rand() * 0.2,
      alpha: 0.55 + rand() * 0.35,
    }));
    clusters.push({
      plane: 0,
      baseW: 0.65 + rand() * 0.4,
      baseH: 0.12 + rand() * 0.05,
      topFrac: 0.01 + rand() * 0.14,
      phase: (i / 4 + rand() * 0.12) % 1,
      speedMult: 0.22 + rand() * 0.06,
      opacity: 0.55 + rand() * 0.3,
      subPuffs,
    });
  }

  // Plane 1: Mid-Ground Altocumulus / Cumulus (primary volumetric masses, billowy turbulence)
  for (let i = 0; i < 5; i++) {
    const subPuffs: PuffSubNode[] = Array.from({ length: 5 }, (_, j) => {
      const t = j / 4 - 0.5;
      return {
        ox: t * 0.52 + (rand() - 0.5) * 0.08,
        oy: Math.abs(t) * 0.12 + (rand() - 0.5) * 0.06,
        scaleW: (1 - Math.abs(t) * 0.35) * (0.62 + rand() * 0.28),
        scaleH: (1 - Math.abs(t) * 0.3) * (0.65 + rand() * 0.3),
        spriteIdx: 2 + (j % 3),
        morphPhase: rand() * Math.PI * 2,
        morphSpeed: 0.45 + rand() * 0.35,
        alpha: 0.75 + rand() * 0.25,
      };
    });
    clusters.push({
      plane: 1,
      baseW: 0.58 + rand() * 0.38,
      baseH: 0.22 + rand() * 0.08,
      topFrac: 0.03 + rand() * 0.18,
      phase: (i / 5 + rand() * 0.1) % 1,
      speedMult: 0.52 + rand() * 0.14,
      opacity: 0.78 + rand() * 0.22,
      subPuffs,
    });
  }

  // Plane 2: Foreground Low-Altitude Stratocumulus (faster drift, dense undersides, motion stretch)
  for (let i = 0; i < 4; i++) {
    const subPuffs: PuffSubNode[] = Array.from({ length: 4 }, (_, j) => {
      const t = j / 3 - 0.5;
      return {
        ox: t * 0.56 + (rand() - 0.5) * 0.07,
        oy: 0.05 + (rand() - 0.5) * 0.06,
        scaleW: 0.72 + rand() * 0.32,
        scaleH: 0.58 + rand() * 0.25,
        spriteIdx: 5 + (j % 2),
        morphPhase: rand() * Math.PI * 2,
        morphSpeed: 0.65 + rand() * 0.4,
        alpha: 0.8 + rand() * 0.2,
      };
    });
    clusters.push({
      plane: 2,
      baseW: 0.68 + rand() * 0.42,
      baseH: 0.2 + rand() * 0.07,
      topFrac: 0.1 + rand() * 0.18,
      phase: (i / 4 + rand() * 0.15) % 1,
      speedMult: 0.92 + rand() * 0.18,
      opacity: 0.82 + rand() * 0.18,
      subPuffs,
    });
  }

  return clusters;
}

export interface VolumetricCloudLayerProps {
  opacity: Animated.Value;
  /** Cloud cover density in [0, 1]. */
  cover: number;
  /** Normalized wind speed in [0, 1]. */
  wind: number;
  /** Horizontal wind direction: 1 (left->right) or -1 (right->left). */
  windDir: 1 | -1;
  /** Active solar state for physically inspired scattering palette. */
  solar?: SolarState;
  /** Sun elevation in [0, 1]. */
  sunElevation?: number;
  /** Thunderstorm intensity in [0, 1]. */
  storm?: number;
  /** Rain intensity in [0, 1]. */
  rain?: number;
  /** Legacy fallback light hex. */
  light?: string;
  /** Legacy fallback shade hex. */
  shade?: string;
  /** Legacy count prop. */
  count?: number;
}

// ============================================================================
// 5. WEB HTML5 CANVAS 2D OFF-SCREEN BLITTING RENDERER (60 FPS)
// ============================================================================

function WebVolumetricCloudCanvas({
  cover,
  wind,
  windDir,
  palette,
  storm,
}: {
  cover: number;
  wind: number;
  windDir: 1 | -1;
  palette: VolumetricPalette;
  storm: number;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const hostRef = useRef<HTMLElement | null>(null);
  const clusters = useMemo(() => generateCloudClusters(701), []);

  // Keep latest dynamic weather props in a ref so the 60fps rAF loop never restarts on prop ticks
  const stateRef = useRef({ cover, wind, windDir, storm, palette });
  useEffect(() => {
    stateRef.current = { cover, wind, windDir, storm, palette };
  }, [cover, wind, windDir, storm, palette]);

  // Pre-render the 7 offscreen volumetric fBm puff sprites whenever the lighting palette changes
  const paletteKey = useMemo(
    () =>
      `${palette.rimLight.join(',')}-${palette.sunlitCore.join(',')}-${palette.bounceShadow.join(',')}-${Math.round(storm * 5)}`,
    [palette, storm],
  );

  const spriteBankRef = useRef<OffscreenPuffSprite[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const bank: OffscreenPuffSprite[] = [
      buildVolumetricPuffSprite('cirrus', 101, palette, storm),
      buildVolumetricPuffSprite('cirrus', 203, palette, storm),
      buildVolumetricPuffSprite('altocumulus', 307, palette, storm),
      buildVolumetricPuffSprite('altocumulus', 409, palette, storm),
      buildVolumetricPuffSprite('altocumulus', 521, palette, storm),
      buildVolumetricPuffSprite('stratocumulus', 613, palette, storm),
      buildVolumetricPuffSprite('stratocumulus', 727, palette, storm),
    ];
    const previous = spriteBankRef.current;
    spriteBankRef.current = bank;
    return () => {
      // Release detached offscreen canvas backing memory
      previous.forEach((s) => {
        s.canvas.width = 0;
        s.canvas.height = 0;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteKey]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const container = hostRef.current;
    if (!container || typeof container.appendChild !== 'function') return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: true });
    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let driftProgress = 0;
    let lightningPulse = 0;
    let nextLightningAt = 2.2 + Math.random() * 3.5;

    const handleResize = () => {
      // Cap internal render resolution to 1.25x DPR to guarantee 60 FPS on mobile/laptop GPUs
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    handleResize();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;

      const { cover: cCover, wind: cWind, windDir: cDir, storm: cStorm, palette: cPal } = stateRef.current;
      // Base angular velocity scales with wind speed (calm drift -> gale-force stream)
      const baseVel = 0.0045 + cWind * 0.022;
      driftProgress += dt * baseVel * cDir;

      // Internal thunderstorm subsurface lightning pulse
      if (cStorm > 0.08) {
        if (elapsed >= nextLightningAt) {
          lightningPulse = 0.75 + Math.random() * 0.25;
          nextLightningAt = elapsed + (2.5 + Math.random() * 5.0) / (0.6 + cStorm * 0.6);
        }
        lightningPulse = Math.max(0, lightningPulse - dt * 3.6);
      } else {
        lightningPulse = 0;
      }

      if (ctx && spriteBankRef.current.length > 0) {
        const skyH = H * 0.54; // Clouds live in the upper 54% of the viewport
        ctx.clearRect(0, 0, W, skyH);

        // Determine visible cluster count from cloud cover
        const visibleRatio = Math.min(1, 0.35 + cCover * 0.65);

        for (let i = 0; i < clusters.length; i++) {
          const cl = clusters[i];
          const clusterWeight = Math.min(1, Math.max(0, (cCover * clusters.length - i * 0.55) / 2.2));
          if (clusterWeight <= 0.02) continue;

          const cw = W * cl.baseW * (0.85 + 0.25 * cCover);
          const ch = H * cl.baseH * (0.85 + 0.2 * cCover);
          const spanW = W + cw * 1.4;
          const wrapped = (((cl.phase + driftProgress * cl.speedMult) % 1) + 1) % 1;
          const cx = -cw * 0.7 + wrapped * spanW;
          const cy = H * cl.topFrac + ch * 0.42;

          ctx.save();
          // Plane-specific atmospheric blending & upper-wind shear
          if (cl.plane === 0) {
            // High-altitude Cirrus: soft additive screen blend + wind shear slant
            ctx.globalCompositeOperation = 'screen';
            const shear = cDir * (0.18 + cWind * 0.35);
            ctx.transform(1, 0, shear, 1, cx, cy);
          } else if (cl.plane === 2) {
            // Low-altitude Stratocumulus: subtle horizontal wind stretch (motion blur cue)
            ctx.globalCompositeOperation = 'source-over';
            const stretch = 1 + cWind * 0.16;
            ctx.transform(stretch, 0, 0, 1, cx, cy);
          } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.translate(cx, cy);
          }

          // Render evolving sub-puffs (procedural edge deformation via continuous time `elapsed`)
          const clusterAlpha = cl.opacity * visibleRatio * clusterWeight;
          for (let j = 0; j < cl.subPuffs.length; j++) {
            const p = cl.subPuffs[j];
            const sprite = spriteBankRef.current[p.spriteIdx];
            if (!sprite) continue;

            const theta = elapsed * p.morphSpeed + p.morphPhase;
            const deformX = Math.sin(theta) * cw * 0.035;
            const deformY = Math.cos(theta * 0.85) * ch * 0.04;
            const breatheW = 1 + Math.sin(theta * 0.7) * 0.06;
            const breatheH = 1 + Math.cos(theta * 0.7) * 0.06;

            const pw = cw * p.scaleW * breatheW;
            const ph = ch * p.scaleH * breatheH;
            const px = p.ox * cw + deformX - pw * 0.5;
            const py = p.oy * ch + deformY - ph * 0.5;

            ctx.globalAlpha = Math.min(1, clusterAlpha * p.alpha);
            ctx.drawImage(sprite.canvas, px, py, pw, ph);
          }

          // Internal subsurface lightning illumination glow inside storm clouds
          if (lightningPulse > 0.02 && cl.plane >= 1) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = lightningPulse * 0.55 * clusterWeight;
            const [lr, lg, lb] = cPal.lightningCore;
            const grad = ctx.createRadialGradient(0, 0, cw * 0.04, 0, 0, cw * 0.45);
            grad.addColorStop(0, `rgba(${lr},${lg},${lb},0.95)`);
            grad.addColorStop(0.5, `rgba(${lr},${lg},${lb},0.35)`);
            grad.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, cw * 0.45, ch * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        // Edge Soft-Masking: vertical alpha feather so clouds dissipate organically above UI cards
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        const maskGrad = ctx.createLinearGradient(0, 0, 0, skyH);
        maskGrad.addColorStop(0, 'rgba(0,0,0,0.92)');
        maskGrad.addColorStop(0.58, 'rgba(0,0,0,0.96)');
        maskGrad.addColorStop(0.86, 'rgba(0,0,0,0.35)');
        maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = maskGrad;
        ctx.fillRect(0, 0, W, skyH);
        ctx.restore();
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.width = 0;
      canvas.height = 0;
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [W, H, clusters]);

  return (
    <View
      ref={(node) => {
        hostRef.current = node as unknown as HTMLElement | null;
      }}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}

// ============================================================================
// 6. NATIVE MULTI-PLANE VOLUMETRIC SVG FALLBACK (iOS / Android)
// ============================================================================

function NativeVolumetricCloudPlane({
  cover,
  wind,
  windDir,
  palette,
}: {
  cover: number;
  wind: number;
  windDir: 1 | -1;
  palette: VolumetricPalette;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const speedScale = 1 - 0.65 * wind;
  // 3 distinct parallax depth loops: Cirrus (slowest), Altocumulus (mid), Stratocumulus (fastest)
  const loopCirrus = useLoop(240000 * speedScale);
  const loopAlto = useLoop(145000 * speedScale);
  const loopStrato = useLoop(88000 * speedScale);
  const morphLoop = useLoop(9500, Easing.inOut(Easing.sin));

  const rimHex = rgbToHex(palette.rimLight);
  const coreHex = rgbToHex(palette.sunlitCore);
  const midHex = rgbToHex(palette.midOcclusion);
  const bounceHex = rgbToHex(palette.bounceShadow);

  const items = useParticles(10, 701, (r, i) => {
    const plane = (i % 3) as 0 | 1 | 2;
    return {
      plane,
      w: W * (plane === 0 ? 0.72 + r() * 0.35 : 0.58 + r() * 0.42),
      top: H * (plane === 0 ? 0.01 + r() * 0.12 : plane === 1 ? 0.04 + r() * 0.16 : 0.1 + r() * 0.16),
      phase: (i / 10 + r() * 0.08) % 1,
      alpha: (plane === 0 ? 0.45 : plane === 1 ? 0.78 : 0.85) * (0.7 + r() * 0.3),
    };
  }).sort((a, b) => a.plane - b.plane);

  const loops = [loopCirrus, loopAlto, loopStrato];
  const morphScaleX = morphLoop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.96, 1.05, 0.96],
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scaleX: windDir }] }]}>
      {items.map((c, idx) => (
        <Animated.View
          key={idx}
          style={{
            position: 'absolute',
            top: c.top,
            opacity: c.alpha * Math.min(1, 0.32 + cover * 0.68),
            transform: [
              { translateX: phased(loops[c.plane], c.phase, -c.w, W) },
              { scaleX: morphScaleX },
            ],
          }}
        >
          <Svg width={c.w} height={c.w * 0.48} viewBox="0 0 240 115">
            <Defs>
              {/* Subsurface Rim & Sunlit Core Radial Gradient */}
              <RadialGradient id={`vCore${idx}`} cx="52%" cy="28%" rx="54%" ry="54%">
                <Stop offset="0%" stopColor={rimHex} stopOpacity={0.96} />
                <Stop offset="32%" stopColor={coreHex} stopOpacity={0.88} />
                <Stop offset="72%" stopColor={midHex} stopOpacity={0.48} />
                <Stop offset="100%" stopColor={midHex} stopOpacity={0} />
              </RadialGradient>
              {/* Sky-Bounce Ambient Occlusion Underside Gradient */}
              <RadialGradient id={`vBase${idx}`} cx="50%" cy="68%" rx="55%" ry="42%">
                <Stop offset="0%" stopColor={bounceHex} stopOpacity={0.85} />
                <Stop offset="62%" stopColor={midHex} stopOpacity={0.42} />
                <Stop offset="100%" stopColor={bounceHex} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            {c.plane === 0 ? (
              /* High-Altitude Sheared Cirrus Filaments */
              <G>
                <Ellipse cx={120} cy={48} rx={108} ry={16} fill={`url(#vCore${idx})`} />
                <Ellipse cx={86} cy={38} rx={76} ry={12} fill={`url(#vCore${idx})`} />
                <Ellipse cx={154} cy={56} rx={72} ry={11} fill={`url(#vCore${idx})`} />
              </G>
            ) : (
              /* Volumetric Altocumulus & Stratocumulus Multi-Puff Cluster */
              <G>
                <Ellipse cx={120} cy={78} rx={104} ry={28} fill={`url(#vBase${idx})`} />
                <Circle cx={68} cy={64} r={38} fill={`url(#vBase${idx})`} />
                <Circle cx={166} cy={68} r={36} fill={`url(#vBase${idx})`} />
                <Circle cx={116} cy={48} r={46} fill={`url(#vCore${idx})`} />
                <Circle cx={72} cy={56} r={36} fill={`url(#vCore${idx})`} />
                <Circle cx={160} cy={58} r={34} fill={`url(#vCore${idx})`} />
                <Ellipse cx={120} cy={68} rx={92} ry={24} fill={`url(#vCore${idx})`} />
              </G>
            )}
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

// ============================================================================
// 7. EXPORTED VOLUMETRIC CLOUD LAYER COMPONENT
// ============================================================================

export function CloudLayer({
  opacity,
  cover,
  wind,
  windDir,
  solar = 'afternoon',
  sunElevation = 0.7,
  storm = 0,
  rain = 0,
}: VolumetricCloudLayerProps) {
  const { height: H } = useWindowDimensions();

  const palette = useMemo(
    () => resolveVolumetricPalette(solar, sunElevation, storm, rain),
    [solar, sunElevation, storm, rain],
  );

  const upperCanopyColor = useMemo(() => {
    const [r, g, b] = palette.bounceShadow;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${(0.42 * cover).toFixed(3)})`;
  }, [palette.bounceShadow, cover]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {/* Upper-sky atmospheric canopy blend so cloud tops melt seamlessly into the zenith */}
      <LinearGradient
        colors={[upperCanopyColor, 'rgba(0,0,0,0)']}
        style={[StyleSheet.absoluteFill, { height: H * 0.38 }]}
      />

      {Platform.OS === 'web' ? (
        <WebVolumetricCloudCanvas
          cover={cover}
          wind={wind}
          windDir={windDir}
          palette={palette}
          storm={storm}
        />
      ) : (
        <NativeVolumetricCloudPlane
          cover={cover}
          wind={wind}
          windDir={windDir}
          palette={palette}
        />
      )}
    </Animated.View>
  );
}