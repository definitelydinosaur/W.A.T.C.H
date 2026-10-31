// Maps raw weather data (WMO code, wind, precipitation) to normalised 0..1 layer intensities.
// Pure + testable: the visual layers never look at weather codes themselves.

export interface SkyConditions {
  cloud: number; // cloud cover / density
  rain: number; // rain streak density
  snow: number;
  fog: number; // haze / fog / mist wash
  storm: number; // thunder: dark clouds + lightning
  sun: number; // clear-sky glare + rays (day only)
  wind: number; // 0 calm .. 1 gale
  windDir: 1 | -1; // 1 = blowing left→right
  windTiltDeg: number; // signed slant applied to precipitation
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Compass label ("NE") -> degrees the wind comes FROM. */
export function compassToDeg(label?: string): number | null {
  const i = label ? COMPASS.indexOf(label.toUpperCase()) : -1;
  return i < 0 ? null : i * 22.5;
}

export interface SkyInput {
  weatherCode: number;
  isDay: boolean;
  windKph?: number;
  /** Compass label (e.g. "NE") the wind blows FROM. */
  windDirection?: string;
  /** Precipitation in mm/h. */
  precipitationMm?: number;
}

export type WeatherPresetId =
  | 'live'
  | 'sunny'
  | 'cloudy'
  | 'windy'
  | 'fog'
  | 'rain'
  | 'storm'
  | 'snow';

export interface WeatherPreset {
  id: WeatherPresetId;
  label: string;
  icon: string;
  weatherCode: number;
  windKph: number;
  windDirection: string;
  precipitationMm: number;
}

export const WEATHER_PRESETS: WeatherPreset[] = [
  { id: 'live', label: 'Live Sky', icon: '📡', weatherCode: 0, windKph: 10, windDirection: 'NE', precipitationMm: 0 },
  { id: 'sunny', label: 'Sunny', icon: '☀️', weatherCode: 0, windKph: 8, windDirection: 'E', precipitationMm: 0 },
  { id: 'cloudy', label: 'Cloudy', icon: '☁️', weatherCode: 3, windKph: 18, windDirection: 'ENE', precipitationMm: 0 },
  { id: 'windy', label: 'Windy', icon: '💨', weatherCode: 2, windKph: 52, windDirection: 'NE', precipitationMm: 0 },
  { id: 'fog', label: 'Haze / Fog', icon: '🌫️', weatherCode: 45, windKph: 6, windDirection: 'E', precipitationMm: 0 },
  { id: 'rain', label: 'Rainy', icon: '🌧️', weatherCode: 63, windKph: 26, windDirection: 'NE', precipitationMm: 4.2 },
  { id: 'storm', label: 'Stormy', icon: '⛈️', weatherCode: 96, windKph: 56, windDirection: 'ENE', precipitationMm: 9.5 },
  { id: 'snow', label: 'Snowy', icon: '❄️', weatherCode: 75, windKph: 20, windDirection: 'NNE', precipitationMm: 2.0 },
];


export function resolveConditions({
  weatherCode: c,
  isDay,
  windKph = 0,
  windDirection,
  precipitationMm = 0,
}: SkyInput): SkyConditions {
  let cloud = 0.15;
  let rainBase = 0;
  let snow = 0;
  let fog = 0;
  let storm = 0;

  if (c === 0) cloud = 0.05;
  else if (c === 1) cloud = 0.25;
  else if (c === 2) cloud = 0.55;
  else if (c === 3) cloud = 0.9;
  else if (c === 45 || c === 48) {
    fog = c === 48 ? 1 : 0.8;
    cloud = 0.5;
  } else if (c >= 51 && c <= 57) {
    rainBase = c === 51 ? 0.18 : c === 53 ? 0.25 : 0.32;
    cloud = 0.85;
  } else if (c >= 61 && c <= 67) {
    rainBase = c === 61 || c === 66 ? 0.4 : c === 63 ? 0.65 : 0.9;
    cloud = 0.95;
  } else if (c >= 71 && c <= 77) {
    snow = c === 71 ? 0.4 : c === 73 ? 0.65 : 0.9;
    cloud = 0.85;
  } else if (c >= 80 && c <= 82) {
    rainBase = c === 80 ? 0.5 : c === 81 ? 0.75 : 1;
    cloud = 0.95;
  } else if (c === 85 || c === 86) {
    snow = c === 85 ? 0.6 : 0.95;
    cloud = 0.9;
  } else if (c >= 95) {
    rainBase = 0.85;
    storm = c >= 99 ? 1 : 0.85;
    cloud = 1;
  }

  // Measured precipitation overrides the code-based guess when it is heavier.
  const rain = rainBase > 0 || precipitationMm > 0.1 ? clamp01(Math.max(rainBase, precipitationMm / 6)) : 0;

  const wind = clamp01((windKph - 12) / 48);
  const from = compassToDeg(windDirection);
  // Direction the air moves toward; east-ward component decides screen direction.
  const toward = from === null ? 90 : (from + 180) % 360;
  const east = Math.sin((toward * Math.PI) / 180);
  const windDir: 1 | -1 = east >= 0 ? 1 : -1;

  return {
    cloud,
    rain,
    snow,
    fog,
    storm,
    sun: isDay ? clamp01(1 - cloud * 1.15 - fog * 0.4 - rain) : 0,
    wind,
    windDir,
    // Rain leans further with stronger wind; clockwise-positive rotation leans left, so negate.
    windTiltDeg: -windDir * (4 + wind * 22) * Math.max(0.35, Math.abs(east)),
  };
}

