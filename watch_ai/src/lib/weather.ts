// Free, keyless weather data from Open-Meteo (https://open-meteo.com), tuned for Cebu.

export const CEBU = { name: 'Cebu City', latitude: 10.3157, longitude: 123.8854 };
const TIMEZONE = 'Asia/Manila';

export interface Forecast {
  updatedAt: string;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    precipitationMm: number;
    windKph: number;
    windDirection: string;
    weatherCode: number;
    uvIndex: number;
  };
  airQuality: { aqi: number | null; pm25: number | null; pm10: number | null };
  hourly: {
    time: string;
    temperatureC: number;
    precipitationProbability: number;
    weatherCode: number;
  }[];
  daily: {
    date: string;
    minC: number;
    maxC: number;
    precipitationProbability: number;
    precipitationMm: number;
    weatherCode: number;
    sunrise: string;
    sunset: string;
    uvMax: number;
  }[];
  risk: { level: 'Normal' | 'Warning' | 'Severe'; reason: string };
  riskMeasurements: { rainMm: number; windKph: number; heatIndexC: number };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

function compass(deg: number) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function aqiLabel(aqi: number | null) {
  if (aqi === null) return 'Unavailable';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

export function uvLabel(uv: number) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

export function weatherDescription(code: number) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

export function weatherIcon(code: number) {
  if (code === 0 || code === 1) return '☀';
  if (code <= 3) return '☁';
  if (code <= 48) return '≋';
  if (code <= 67 || (code >= 80 && code <= 82)) return '☂';
  return '⚡';
}

export async function fetchForecast(
  signal?: AbortSignal,
  { latitude, longitude }: { latitude: number; longitude: number } = CEBU,
): Promise<Forecast> {
  const base = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: TIMEZONE,
  });

  const weatherParams = new URLSearchParams(base);
  weatherParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index',
  );
  weatherParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
  weatherParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,uv_index_max',
  );
  weatherParams.set('wind_speed_unit', 'kmh');
  weatherParams.set('forecast_days', '7');

  const airParams = new URLSearchParams(base);
  airParams.set('current', 'us_aqi,pm2_5,pm10');

  const [weatherRes, airRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, { signal }),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`, { signal }).catch(
      () => null,
    ),
  ]);
  if (!weatherRes.ok) throw new Error(`Weather request failed (${weatherRes.status}).`);
  const w = await weatherRes.json();

  let airQuality: Forecast['airQuality'] = { aqi: null, pm25: null, pm10: null };
  if (airRes && airRes.ok) {
    const a = await airRes.json();
    airQuality = {
      aqi: typeof a.current?.us_aqi === 'number' ? a.current.us_aqi : null,
      pm25: typeof a.current?.pm2_5 === 'number' ? a.current.pm2_5 : null,
      pm10: typeof a.current?.pm10 === 'number' ? a.current.pm10 : null,
    };
  }

  const c = w.current ?? {};
  const current: Forecast['current'] = {
    temperatureC: num(c.temperature_2m),
    feelsLikeC: num(c.apparent_temperature),
    humidityPercent: num(c.relative_humidity_2m),
    precipitationMm: num(c.precipitation),
    windKph: num(c.wind_speed_10m),
    windDirection: compass(num(c.wind_direction_10m)),
    weatherCode: num(c.weather_code),
    uvIndex: num(c.uv_index),
  };

  // Start the hourly list at the current hour (Open-Meteo returns the whole day from 00:00).
  const hTimes: string[] = w.hourly?.time ?? [];
  const nowIso: string = c.time ?? new Date().toISOString().slice(0, 13);
  const startIdx = Math.max(0, hTimes.findIndex((t) => t >= nowIso.slice(0, 13)));
  const hourly = hTimes.slice(startIdx, startIdx + 24).map((time, i) => ({
    time,
    temperatureC: num(w.hourly.temperature_2m[startIdx + i]),
    precipitationProbability: num(w.hourly.precipitation_probability[startIdx + i]),
    weatherCode: num(w.hourly.weather_code[startIdx + i]),
  }));

  const d = w.daily ?? {};
  const daily: Forecast['daily'] = (d.time ?? []).map((date: string, i: number) => ({
    date,
    minC: num(d.temperature_2m_min?.[i]),
    maxC: num(d.temperature_2m_max?.[i]),
    precipitationProbability: num(d.precipitation_probability_max?.[i]),
    precipitationMm: num(d.precipitation_sum?.[i]),
    weatherCode: num(d.weather_code?.[i]),
    sunrise: d.sunrise?.[i] ?? '',
    sunset: d.sunset?.[i] ?? '',
    uvMax: num(d.uv_index_max?.[i]),
  }));

  const rainMm = daily[0]?.precipitationMm ?? 0;
  const heatIndexC = current.feelsLikeC;
  let risk: Forecast['risk'] = { level: 'Normal', reason: 'No significant weather hazards expected.' };
  if (current.windKph >= 62 || rainMm >= 50 || heatIndexC >= 41 || current.weatherCode >= 95) {
    risk = { level: 'Severe', reason: 'Dangerous conditions possible. Avoid unnecessary travel.' };
  } else if (current.windKph >= 39 || rainMm >= 15 || heatIndexC >= 33) {
    risk = { level: 'Warning', reason: 'Strong wind, heavy rain, or high heat is possible today.' };
  }

  return {
    updatedAt: new Date().toISOString(),
    current,
    airQuality,
    hourly,
    daily,
    risk,
    riskMeasurements: { rainMm, windKph: current.windKph, heatIndexC },
  };
}
