import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import {
  HourTheme,
  SolarState,
  SunTimes,
  getHourTheme,
  getMoonPhase,
  manilaIso,
} from '../../lib/solar-theme';
import { useSmooth } from './animation';
import {
  CloudLayer,
  FogLayer,
  LightningLayer,
  RainLayer,
  SnowLayer,
  StarLayer,
  SunLayer,
  WindLayer,
  mix,
  tier,
} from './layers';
import { resolveConditions } from './sky-conditions';

export interface WeatherBackdropProps {
  /** Active local ISO timestamp ("YYYY-MM-DDTHH:mm"). Defaults to current Manila time. */
  iso?: string;
  /** Sunrise and sunset ISO timestamps for the active day. */
  sun?: SunTimes;
  /** Optional pre-resolved HourTheme; if omitted, computed from `iso` and `sun`. */
  theme?: HourTheme;
  /** WMO weather code (0..99). */
  weatherCode?: number;
  /** Wind speed in km/h. */
  windKph?: number;
  /** Compass wind direction (e.g. "NE", "WSW"). */
  windDirection?: string;
  /** Precipitation intensity in mm/h. */
  precipitationMm?: number;
  /** Vertical screen fraction (0..1) where rain splash ripples land. */
  groundLine?: number;
}

interface CloudPalette {
  light: string;
  shade: string;
  warm: number;
}

function getCloudPalette(solar: SolarState, colorTemp: number, storm: number, rain: number): CloudPalette {
  let light = '#f4f8ff';
  let shade = '#7e96bc';
  let warm = Math.max(0, colorTemp);

  switch (solar) {
    case 'dawn':
      light = '#f5c6d0';
      shade = '#5e4973';
      warm = 0.85;
      break;
    case 'sunrise':
      light = '#ffd8b8';
      shade = '#7a4e6d';
      warm = 1;
      break;
    case 'morning':
      light = '#fff6e8';
      shade = '#7c9ec9';
      warm = 0.45;
      break;
    case 'high-sun':
      light = '#ffffff';
      shade = '#7899c4';
      warm = 0.1;
      break;
    case 'afternoon':
      light = '#f2f7ff';
      shade = '#6d8db8';
      warm = 0.3;
      break;
    case 'golden-hour':
      light = '#ffd199';
      shade = '#7d5260';
      warm = 0.95;
      break;
    case 'sunset':
      light = '#ffb088';
      shade = '#59365c';
      warm = 1;
      break;
    case 'dusk':
      light = '#595282';
      shade = '#262344';
      warm = 0.45;
      break;
    case 'night':
      light = '#323b61';
      shade = '#161b33';
      warm = 0;
      break;
  }

  const darken = Math.min(1, storm * 0.85 + rain * 0.45);
  if (darken > 0) {
    light = mix(light, '#384057', darken);
    shade = mix(shade, '#181c2b', darken);
  }

  return { light, shade, warm };
}

function tintSkyGradient(
  base: [string, string, string],
  storm: number,
  rain: number,
  fog: number,
  isDay: boolean,
): [string, string, string] {
  const heavy = Math.min(1, storm * 0.78 + rain * 0.38);
  let [c0, c1, c2] = base;
  if (heavy > 0.01) {
    const stormTop = isDay ? '#1b2236' : '#060812';
    const stormMid = isDay ? '#29324d' : '#0f1326';
    const stormBot = isDay ? '#192033' : '#060810';
    c0 = mix(c0, stormTop, heavy);
    c1 = mix(c1, stormMid, heavy);
    c2 = mix(c2, stormBot, heavy);
  }
  if (fog > 0.01) {
    const fogTint = isDay ? '#8894a2' : '#232938';
    const f = fog * (isDay ? 0.52 : 0.32);
    c0 = mix(c0, fogTint, f);
    c1 = mix(c1, fogTint, f);
    c2 = mix(c2, fogTint, f * 0.72);
  }
  return [c0, c1, c2];
}

interface BackdropSnapshot {
  key: string;
  bg: [string, string, string];
  tempWash: [string, string, string];
  overlay: [string, string, string];
  glowColor: string;
  colorTemp: number;
}

function SkyGradientCanvas({
  snap,
  width,
  height,
}: {
  snap: BackdropSnapshot;
  width: number;
  height: number;
}) {
  // Position color-temperature bloom near the horizon during warm dawn/golden-hour/sunset,
  // or near the upper zenith during midday and deep night.
  const warm = snap.colorTemp > 0.25;
  const bloomCy = warm ? '78%' : '20%';
  const bloomOpacity = warm ? 0.34 : 0.22;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Primary 3-stop Time-of-Day Sky Gradient */}
      <LinearGradient
        colors={snap.bg}
        locations={[0, 0.52, 1]}
        start={{ x: 0.2, y: 0.0 }}
        end={{ x: 0.8, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Color-Temperature Atmospheric Wash */}
      <LinearGradient
        colors={snap.tempWash}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Soft Radial Color-Temperature Horizon / Zenith Bloom */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`skyBloom-${snap.key}`} cx="50%" cy={bloomCy} rx="75%" ry="55%">
            <Stop offset="0%" stopColor={snap.glowColor} stopOpacity={bloomOpacity} />
            <Stop offset="55%" stopColor={snap.glowColor} stopOpacity={bloomOpacity * 0.35} />
            <Stop offset="100%" stopColor={snap.glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#skyBloom-${snap.key})`} />
      </Svg>
    </View>
  );
}

export function WeatherBackdrop({
  iso,
  sun,
  theme: propTheme,
  weatherCode = 0,
  windKph = 0,
  windDirection,
  precipitationMm = 0,
  groundLine = 0.88,
}: WeatherBackdropProps) {
  const { width: W, height: H } = useWindowDimensions();
  const activeIso = iso || manilaIso();
  const activeTheme = useMemo(
    () => propTheme ?? getHourTheme(activeIso, sun),
    [propTheme, activeIso, sun],
  );

  const cond = useMemo(
    () =>
      resolveConditions({
        weatherCode,
        isDay: activeTheme.isDay,
        windKph,
        windDirection,
        precipitationMm,
      }),
    [weatherCode, activeTheme.isDay, windKph, windDirection, precipitationMm],
  );

  const effectiveBg = useMemo(
    () => tintSkyGradient(activeTheme.bgGradient, cond.storm, cond.rain, cond.fog, activeTheme.isDay),
    [activeTheme.bgGradient, activeTheme.isDay, cond.storm, cond.rain, cond.fog],
  );

  const currentSnap: BackdropSnapshot = useMemo(
    () => ({
      key: `${activeTheme.solar}-${effectiveBg.join(',')}`,
      bg: effectiveBg,
      tempWash: activeTheme.tempWashGradient,
      overlay: activeTheme.overlayGradient,
      glowColor: activeTheme.glowColor,
      colorTemp: activeTheme.colorTemp,
    }),
    [
      activeTheme.solar,
      activeTheme.tempWashGradient,
      activeTheme.overlayGradient,
      activeTheme.glowColor,
      activeTheme.colorTemp,
      effectiveBg,
    ],
  );

  const [prevSnap, setPrevSnap] = useState<BackdropSnapshot | null>(null);
  const lastSnapRef = useRef<BackdropSnapshot>(currentSnap);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (lastSnapRef.current.key === currentSnap.key) return;
    const outgoing = lastSnapRef.current;
    lastSnapRef.current = currentSnap;
    const startTimer = setTimeout(() => setPrevSnap(outgoing), 0);
    fadeAnim.setValue(0);
    const anim = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 950,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setPrevSnap(null);
    });
    return () => {
      clearTimeout(startTimer);
      anim.stop();
    };
  }, [currentSnap, fadeAnim]);

  const nightFactor =
    activeTheme.solar === 'night'
      ? 1
      : activeTheme.solar === 'dusk'
        ? 0.65
        : activeTheme.solar === 'dawn'
          ? 0.45
          : 0;
  const skyClearness = Math.max(0, 1 - cond.cloud * 0.72 - cond.fog * 0.8 - cond.rain * 0.6);
  const starTarget = nightFactor * Math.max(0.18, skyClearness);
  const moonTarget = nightFactor * skyClearness;

  const stars = useSmooth(starTarget, 1400);
  const moonVis = useSmooth(moonTarget, 1400);
  const sunLayer = useSmooth(cond.sun, 1400);
  const cloudLayer = useSmooth(
    cond.cloud > 0.06 ? Math.min(1, 0.32 + cond.cloud * 0.68) : 0,
    1400,
  );
  const fogLayer = useSmooth(cond.fog, 1400);
  const stormLayer = useSmooth(cond.storm, 900);
  const windLayer = useSmooth(cond.wind, 1200);
  const rainLayer = useSmooth(cond.rain, 1000);
  const snowLayer = useSmooth(cond.snow, 1200);

  const moon = useMemo(() => getMoonPhase(activeIso), [activeIso]);
  const cloudPalette = useMemo(
    () => getCloudPalette(activeTheme.solar, activeTheme.colorTemp, cond.storm, cond.rain),
    [activeTheme.solar, activeTheme.colorTemp, cond.storm, cond.rain],
  );

  const cloudCount = tier(4 + cond.cloud * 8, 2);
  const rainCount = tier(20 + cond.rain * 68, 12);
  const snowCount = tier(18 + cond.snow * 46, 8);
  const windCount = tier(6 + cond.wind * 16, 4);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 1. Outgoing Interpolated Sky Gradient Canvas (during cross-fade) */}
      {prevSnap && <SkyGradientCanvas snap={prevSnap} width={W} height={H} />}

      {/* 2. Active Interpolated Sky Gradient Canvas */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: prevSnap ? fadeAnim : 1 }]}>
        <SkyGradientCanvas snap={currentSnap} width={W} height={H} />
      </Animated.View>

      {/* 3. Night Twinkling Star Field & Moon Phase */}
      {stars.mounted && (
        <StarLayer
          opacity={stars.value}
          count={58}
          moonPhase={moon.phase}
          moonIllumination={moon.illumination}
          moonVisible={moonVis.value}
        />
      )}

      {/* 4. Daytime Sun Glare, Diffusion & Rotating Rays */}
      {sunLayer.mounted && (
        <SunLayer
          opacity={sunLayer.value}
          elevation={activeTheme.sunElevation}
          warm={cloudPalette.warm}
        />
      )}

      {/* 5. Photorealistic Volumetric Multi-Depth Clouds (Cirrus, Altocumulus, Stratocumulus) */}
      {cloudLayer.mounted && (
        <CloudLayer
          opacity={cloudLayer.value}
          cover={cond.cloud}
          wind={cond.wind}
          windDir={cond.windDir}
          solar={activeTheme.solar}
          sunElevation={activeTheme.sunElevation}
          storm={cond.storm}
          rain={cond.rain}
          light={cloudPalette.light}
          shade={cloudPalette.shade}
          count={cloudCount}
        />
      )}

      {/* 6. Atmospheric Fog / Haze / Mist Translucent Wash */}
      {fogLayer.mounted && <FogLayer opacity={fogLayer.value} density={cond.fog} />}

      {/* 7. Thunderstorm Sheet Flash & Procedural Lightning Bolts */}
      {stormLayer.mounted && (
        <LightningLayer
          opacity={stormLayer.value}
          intensity={cond.storm}
          enabled={cond.storm > 0.05}
        />
      )}

      {/* 8. Wind Particle Streams & Motion Lines */}
      {windLayer.mounted && (
        <WindLayer
          opacity={windLayer.value}
          wind={cond.wind}
          windDir={cond.windDir}
          count={windCount}
        />
      )}

      {/* 9. Precipitation: Slanted Rain Streaks + Ground Splash Ripples */}
      {rainLayer.mounted && (
        <RainLayer
          opacity={rainLayer.value}
          intensity={cond.rain}
          tiltDeg={cond.windTiltDeg}
          count={rainCount}
          groundLine={groundLine}
        />
      )}

      {/* 10. Precipitation: Gently Swaying Snowflakes */}
      {snowLayer.mounted && (
        <SnowLayer
          opacity={snowLayer.value}
          count={snowCount}
          tiltDeg={cond.windTiltDeg}
        />
      )}

      {/* 11. Atmospheric Vignette & Contrast Guard for UI Readability */}
      <LinearGradient
        colors={currentSnap.overlay}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="edgeVignette" cx="50%" cy="46%" rx="62%" ry="58%">
            <Stop offset="60%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#02040D" stopOpacity={0.34} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={W / 2} cy={H / 2} rx={W * 0.72} ry={H * 0.68} fill="url(#edgeVignette)" />
      </Svg>
    </View>
  );
}
