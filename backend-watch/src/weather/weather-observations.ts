import { detectWeatherHazards } from './weather-risk';

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
