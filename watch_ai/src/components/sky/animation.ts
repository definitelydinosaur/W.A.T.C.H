import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** Repeating 0→1 value on the native driver. Restarts only when `durationMs` changes. */
export function useLoop(durationMs: number, easing: (t: number) => number = Easing.linear) {
  const value = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    value.setValue(0);
    const loop = Animated.loop(
      Animated.timing(value, { toValue: 1, duration: durationMs, easing, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);
  return value;
}

/**
 * Smoothly eases an Animated.Value toward `target`. `mounted` stays true while the layer is
 * visible or fading out, so heavy particle layers are unmounted once they are invisible.
 */
export function useSmooth(target: number, durationMs = 1400) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => new Animated.Value(target), []);
  const [lingering, setLingering] = useState(target > 0.001);
  useEffect(() => {
    const visible = target > 0.001;
    const anim = Animated.timing(value, {
      toValue: target,
      duration: durationMs,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    const t = setTimeout(() => setLingering(visible), visible ? 0 : durationMs + 60);
    return () => {
      anim.stop();
      clearTimeout(t);
    };
  }, [target, durationMs, value]);
  return { value, mounted: target > 0.001 || lingering };
}

/**
 * Interpolation of a looping 0→1 value `t`, offset by `phase`, mapping the wrapped progress
 * q = (t + phase) % 1 linearly onto [from, to]. Lets one shared loop drive many staggered items.
 */
export function phased(t: Animated.Value, phase: number, from: number, to: number) {
  const p = Math.min(0.999, Math.max(0, phase));
  if (p === 0) return t.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const at = (q: number) => from + (to - from) * q;
  return t.interpolate({
    inputRange: [0, 1 - p, 1 - p + 0.0001, 1],
    outputRange: [at(p), to, from, at(p)],
  });
}

/** Deterministic PRNG so particle layouts are stable across renders. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Stable, memoised list of random-but-deterministic items. */
export function useParticles<T>(count: number, seed: number, make: (r: () => number, i: number) => T): T[] {
  return useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, (_, i) => make(r, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, seed]);
}
