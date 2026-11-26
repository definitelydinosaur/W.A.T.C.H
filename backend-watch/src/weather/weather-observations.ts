import { detectWeatherHazards } from './weather-risk';

export const DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES = 60;
export const MIN_WEATHER_ALERT_SUSTAINED_MINUTES = 10;
export const MAX_WEATHER_ALERT_SUSTAINED_MINUTES = 180;

export interface StoredWeatherRecord {
  recorded_at: string;
  temperature: number;
  rainfall: number;
  wind_speed: number;
  weather_condition: string | null;
  humidity: number | null;
  heat_index: number | null;
  uv_index: number | null;
  aqi: number | null;
  is_stale?: boolean;
}

export function getWeatherAlertSustainedMinutes(preferences: unknown): number {
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences)
  ) {
    return DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES;
  }
  const value = (preferences as Record<string, unknown>)
    .weather_sustained_minutes;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MIN_WEATHER_ALERT_SUSTAINED_MINUTES &&
    value <= MAX_WEATHER_ALERT_SUSTAINED_MINUTES
    ? value
    : DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES;
}

export function getSustainedWeatherStart(
  observations: StoredWeatherRecord[],
  meetsCondition: (observation: StoredWeatherRecord) => boolean,
  now = Date.now(),
): string | null {
  const maximumGapMs = 20 * 60 * 1000;
  let startTime: number | null = null;
  let previousTime: number | null = null;

  for (const observation of observations) {
    const recordedAt = Date.parse(observation.recorded_at);
    if (
      observation.is_stale === true ||
      !Number.isFinite(recordedAt) ||
      !meetsCondition(observation)
    ) {
      break;
    }
    if (previousTime === null) {
      if (now - recordedAt > maximumGapMs) return null;
    } else if (previousTime - recordedAt > maximumGapMs) {
      break;
    }
    previousTime = recordedAt;
    startTime = recordedAt;
  }

  return startTime === null ? null : new Date(startTime).toISOString();
}

export function hasConsecutiveHazard(
  hazardType: string,
  observations: StoredWeatherRecord[],
  requiredReadings: number,
) {
  return (
    observations.length >= requiredReadings &&
    observations
      .slice(0, requiredReadings)
      .every(
        (observation) =>
          observation.is_stale !== true &&
          detectWeatherHazards(
            observation.rainfall,
            observation.wind_speed,
            observation.heat_index ?? observation.temperature,
            /thunder|storm/i.test(observation.weather_condition ?? '')
              ? 95
              : -1,
            undefined,
            0,
            [],
            observation.aqi,
          ).some((hazard) => hazard.type === hazardType),
      )
  );
}
