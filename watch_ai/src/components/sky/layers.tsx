import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, Mask, Polygon, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';
import { phased, useLoop, useParticles } from './animation';
import { VolumetricCloudLayer, VolumetricCloudProps } from './cloud-layer';

// ---------- colour helpers ----------
const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
export const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[m(r1, r2), m(g1, g2), m(b1, b2)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};
export const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** Every layer shares this contract: full-screen, never intercepts touches, fades via `opacity`. */
interface LayerProps {
  opacity: Animated.Value;
}
const Layer = ({ opacity, children }: LayerProps & { children: React.ReactNode }) => (
  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
    {children}
  </Animated.View>
);

/** Round to a tier so particle counts only change (and remount) in coarse steps. */
export const tier = (n: number, step = 8) => Math.max(step, Math.round(n / step) * step);

// ---------- Clouds (Volumetric fBm + Henyey-Greenstein Multi-Plane System) ----------
export function CloudLayer(props: VolumetricCloudProps) {
  return <VolumetricCloudLayer {...props} />;
}

// ---------- Rain (+ ripples) ----------
export function RainLayer({
  opacity, intensity, tiltDeg, count, groundLine = 0.88,
}: LayerProps & { intensity: number; tiltDeg: number; count: number; groundLine?: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const base = 1500 - 750 * intensity;
  const loops = [useLoop(base), useLoop(base * 1.3), useLoop(base * 1.7)];
  const ripple = useLoop(1700);
  const cw = W * 1.6;
  const ch = H * 1.4;
  const drops = useParticles(count, 11, (r, i) => ({
    x: r() * cw,
    len: 12 + r() * 20,
    phase: r(),
    cls: i % 3,
    alpha: 0.18 + r() * 0.3,
  }));
  const ripples = useParticles(Math.round(count / 7), 23, (r) => ({
    x: r() * W,
    y: H * (groundLine + r() * 0.09),
    phase: r(),
  }));
  return (
    <Layer opacity={opacity}>
      <View
        style={{
          position: 'absolute', width: cw, height: ch, left: -(cw - W) / 2, top: -(ch - H) / 2,
          transform: [{ rotate: `${tiltDeg}deg` }],
        }}
      >
        {drops.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: d.x, width: 1.5, height: d.len, borderRadius: 1,
              backgroundColor: `rgba(205,222,255,${d.alpha})`,
              transform: [{ translateY: phased(loops[d.cls], d.phase, -d.len, ch) }],
            }}
          />
        ))}
      </View>
      {ripples.map((p, i) => (
        <Animated.View
          key={`r${i}`}
          style={{
            position: 'absolute', left: p.x, top: p.y, width: 30, height: 8, borderRadius: 15,
            borderWidth: 1, borderColor: 'rgba(220,235,255,0.7)',
            opacity: phased(ripple, p.phase, 0.6, 0),
            transform: [{ scale: phased(ripple, p.phase, 0.25, 1.5) }],
          }}
        />
      ))}
    </Layer>
  );
}

// ---------- Snow ----------
export function SnowLayer({ opacity, count, tiltDeg }: LayerProps & { count: number; tiltDeg: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const fall = [useLoop(7000), useLoop(10500), useLoop(15000)];
  const swayEase = Easing.inOut(Easing.sin);
  const sway = [useLoop(3200, swayEase), useLoop(4700, swayEase)];
  const cw = W * 1.3;
  const flakes = useParticles(count, 31, (r, i) => ({
    x: r() * cw,
    size: 2 + r() * 4,
    phase: r(),
    cls: i % 3,
    amp: 8 + r() * 18,
    s: i % 2,
    alpha: 0.4 + r() * 0.55,
  }));
  return (
    <Layer opacity={opacity}>
      <View
        style={{
          position: 'absolute', width: cw, height: H * 1.2, left: -(cw - W) / 2, top: -H * 0.1,
          transform: [{ rotate: `${tiltDeg * 0.5}deg` }],
        }}
      >
        {flakes.map((f, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: f.x, opacity: f.alpha,
              transform: [{ translateY: phased(fall[f.cls], f.phase, -10, H * 1.2) }],
            }}
          >
            <Animated.View
              style={{
                width: f.size, height: f.size, borderRadius: f.size, backgroundColor: '#fff',
                transform: [{ translateX: sway[f.s].interpolate({ inputRange: [0, 0.5, 1], outputRange: [-f.amp, f.amp, -f.amp] }) }],
              }}
            />
          </Animated.View>
        ))}
      </View>
    </Layer>
  );
}

// ---------- Wind ----------
export function WindLayer({ opacity, wind, windDir, count }: LayerProps & { wind: number; windDir: 1 | -1; count: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const base = 2800 - 1900 * wind;
  const loops = [useLoop(base), useLoop(base * 1.35), useLoop(base * 1.8)];
  const streaks = useParticles(count, 41, (r, i) => ({
    y: H * (0.04 + r() * 0.8),
    w: 60 + r() * 140,
    phase: r(),
    cls: i % 3,
    alpha: 0.35 + r() * 0.65,
    dot: i % 4 === 0,
  }));
  return (
    <Layer opacity={opacity}>
      <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: windDir }] }]}>
        {streaks.map((s, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', top: s.y, opacity: s.alpha * (0.2 + 0.35 * wind),
              transform: [{ translateX: phased(loops[s.cls], s.phase, -s.w - 40, W + 40) }],
            }}
          >
            {s.dot ? (
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
            ) : (
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: s.w, height: 1.5 }}
              />
            )}
          </Animated.View>
        ))}
      </View>
    </Layer>
  );
}

// ---------- Sun glare + rays ----------
export function SunLayer({
  opacity, elevation, warm, animate = true,
}: LayerProps & { elevation: number; warm: number; animate?: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const spin = useLoop(120000);
  const pulse = useLoop(7000, Easing.inOut(Easing.sin));
  const color = mix('#fff6d6', '#ffb36b', warm); // lower sun → warmer light
  const size = W * 1.5;
  const cx = W * 0.78;
  const cy = H * (0.07 + (1 - elevation) * 0.1);
  const wedges = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const spread = 0.07;
    const R = 100;
    const p = (ang: number) => `${100 + Math.cos(ang) * R},${100 + Math.sin(ang) * R}`;
    return `100,100 ${p(a - spread)} ${p(a + spread)}`;
  });
  return (
    <Layer opacity={opacity}>
      <LinearGradient
        colors={[rgba(color, 0.32), rgba(color, 0)]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={{
          position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.07, 1] }) }],
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={color} stopOpacity={0.85} />
              <Stop offset="0.12" stopColor={color} stopOpacity={0.5} />
              <Stop offset="0.45" stopColor={color} stopOpacity={0.12} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={200} height={200} fill="url(#sunGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, opacity: 0.5,
          transform: [{ rotate: animate ? spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) : '0deg' }],
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          {wedges.map((pts, i) => (
            <Polygon key={i} points={pts} fill={rgba(color, i % 2 ? 0.07 : 0.12)} />
          ))}
        </Svg>
      </Animated.View>
    </Layer>
  );
}

// ---------- Fog / haze ----------
export function FogLayer({ opacity, density }: LayerProps & { density: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const loops = [useLoop(70000), useLoop(95000), useLoop(130000)];
  const bands = useParticles(5, 53, (r, i) => ({
    y: H * (0.1 + i * 0.17 + r() * 0.05),
    h: H * (0.2 + r() * 0.12),
    phase: r(),
    cls: i % 3,
  }));
  return (
    <Layer opacity={opacity}>
      {/* Low-contrast, desaturating wash. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(178,186,194,${0.18 + 0.3 * density})` }]} />
      <LinearGradient
        colors={['rgba(214,220,226,0.25)', 'rgba(214,220,226,0.55)', 'rgba(214,220,226,0.3)']}
        style={StyleSheet.absoluteFill}
      />
      {bands.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', top: b.y, opacity: 0.35 + 0.4 * density,
            transform: [{ translateX: phased(loops[b.cls], b.phase, -W * 1.3, W * 0.3) }],
          }}
        >
          <Svg width={W * 1.5} height={b.h} viewBox="0 0 300 100" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id={`fog${i}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#f2f5f7" stopOpacity={0.9} />
                <Stop offset="1" stopColor="#f2f5f7" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={150} cy={50} rx={150} ry={50} fill={`url(#fog${i})`} />
          </Svg>
        </Animated.View>
      ))}
    </Layer>
  );
}

// ---------- Lightning ----------
function boltPoints(W: number, H: number, seed: number) {
  const r = (() => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  let x = W * (0.15 + r() * 0.7);
  let y = 0;
  const pts = [`${x},${y}`];
  while (y < H * 0.5) {
    y += 20 + r() * 30;
    x += (r() - 0.5) * 50;
    pts.push(`${x},${y}`);
  }
  return pts.join(' ');
}

export function LightningLayer({ opacity, intensity, enabled }: LayerProps & { intensity: number; enabled: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const flash = useMemo(() => new Animated.Value(0), []);
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const strike = () => {
      if (!alive) return;
      setSeed(1 + Math.floor(Math.random() * 100000));
      // Max two quick pulses, capped alpha: stays well under photosensitivity guidelines.
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 40, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0.25, duration: 90, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0.8, duration: 50, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      timer = setTimeout(strike, (3500 + Math.random() * 7000) / (0.6 + 0.6 * intensity));
    };
    timer = setTimeout(strike, 1200 + Math.random() * 2500);
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled, intensity, flash]);
  const points = useMemo(() => boltPoints(W, H, seed), [W, H, seed]);
  return (
    <Layer opacity={opacity}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flash }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(200,215,255,0.42)' }]} />
        <Svg width={W} height={H}>
          <Polyline points={points} stroke="rgba(190,210,255,0.5)" strokeWidth={7} fill="none" strokeLinejoin="round" />
          <Polyline points={points} stroke="#fff" strokeWidth={2} fill="none" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Layer>
  );
}

// ---------- Stars + moon ----------
export function StarLayer({ opacity, count, moonPhase, moonIllumination, moonVisible }: LayerProps & {
  count: number; moonPhase: number; moonIllumination: number; moonVisible: Animated.Value;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const ease = Easing.inOut(Easing.sin);
  const twinkle = [useLoop(2200, ease), useLoop(3100, ease), useLoop(3900, ease), useLoop(4600, ease), useLoop(5400, ease)];
  const stars = useParticles(count, 67, (r, i) => ({
    x: r() * W,
    y: r() * H * 0.62,
    size: 0.8 + r() * r() * 2.4,
    base: 0.35 + r() * 0.65,
    cls: i % 5,
  }));
  const R = 22;
  const waxing = moonPhase < 0.5;
  const shadowDx = (waxing ? -1 : 1) * 2 * R * moonIllumination;
  return (
    <Layer opacity={opacity}>
      {stars.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size, borderRadius: s.size,
            backgroundColor: i % 9 === 0 ? '#cfe0ff' : '#ffffff',
            opacity: twinkle[s.cls].interpolate({ inputRange: [0, 0.5, 1], outputRange: [s.base * 0.3, s.base, s.base * 0.3] }),
          }}
        />
      ))}
      <Animated.View style={{ position: 'absolute', left: W * 0.12, top: H * 0.07, opacity: moonVisible }}>
        <Svg width={R * 6} height={R * 6} viewBox={`${-R * 3} ${-R * 3} ${R * 6} ${R * 6}`}>
          <Defs>
            <RadialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.25" stopColor="#dfe8ff" stopOpacity={0.35 * (0.3 + moonIllumination)} />
              <Stop offset="1" stopColor="#dfe8ff" stopOpacity={0} />
            </RadialGradient>
            <Mask id="moonMask">
              <Rect x={-R * 3} y={-R * 3} width={R * 6} height={R * 6} fill="#000" />
              <Circle cx={0} cy={0} r={R} fill="#fff" />
              <Circle cx={shadowDx} cy={0} r={R} fill="#000" />
            </Mask>
          </Defs>
          <Circle cx={0} cy={0} r={R * 3} fill="url(#moonGlow)" />
          <Circle cx={0} cy={0} r={R} fill="#f4f0e0" opacity={0.08} />
          <Rect x={-R * 3} y={-R * 3} width={R * 6} height={R * 6} fill="#f6f2e2" mask="url(#moonMask)" />
        </Svg>
      </Animated.View>
    </Layer>
  );
}

