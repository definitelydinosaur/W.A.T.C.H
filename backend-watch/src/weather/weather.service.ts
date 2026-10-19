import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { classifyWeatherRisk } from './weather-risk';

const CACHE_TTL_MS = 10 * 60 * 1000;
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    weather_code: number;
    uv_index: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
  };
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async getForecast(latitude: number, longitude: number) {
    const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const { data: cached, error: cacheError } = await this.supabase
      .from('weather_cache')
      .select('data, fetched_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheError) {
      this.logger.error(`Weather cache lookup failed: ${cacheError.message}`);
      throw new ServiceUnavailableException(
        'Weather cache is unavailable. Apply the backend Supabase migration.',
      );
    }

    if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_TTL_MS) {
      return cached.data;
    }

    const url = new URL(OPEN_METEO_URL);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code,uv_index',
      hourly: 'temperature_2m,precipitation_probability,weather_code',
      daily:
        'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset',
      forecast_days: '7',
      timezone: 'auto',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
    }).toString();

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    } catch (error) {
      this.logger.error(
        `Open-Meteo request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      if (cached) return { ...cached.data, stale: true };
      throw new ServiceUnavailableException('Weather provider is unavailable.');
    }

    if (!response.ok) {
      this.logger.error(`Open-Meteo returned HTTP ${response.status}.`);
      if (cached) return { ...cached.data, stale: true };
      throw new ServiceUnavailableException('Weather provider returned an error.');
    }

    const sourceData = (await response.json()) as OpenMeteoResponse;
    const current = sourceData.current;
    const payload = {
      location: {
        name:
          Math.abs(latitude - 10.3157) < 0.05 &&
          Math.abs(longitude - 123.8854) < 0.05
            ? 'Cebu City'
            : `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
        latitude,
        longitude,
      },
      updatedAt: new Date().toISOString(),
      source: 'Open-Meteo',
      stale: false,
      current: {
        temperatureC: current.temperature_2m,
        feelsLikeC: current.apparent_temperature,
        humidityPercent: current.relative_humidity_2m,
        precipitationMm: current.precipitation,
        windKph: current.wind_speed_10m,
        windDirectionDegrees: current.wind_direction_10m,
        weatherCode: current.weather_code,
        uvIndex: current.uv_index,
      },
      hourly: sourceData.hourly.time.slice(0, 24).map((time, index) => ({
        time,
        temperatureC: sourceData.hourly.temperature_2m[index],
        precipitationProbability:
          sourceData.hourly.precipitation_probability[index],
        weatherCode: sourceData.hourly.weather_code[index],
      })),
      daily: sourceData.daily.time.map((date, index) => ({
        date,
        minC: sourceData.daily.temperature_2m_min[index],
        maxC: sourceData.daily.temperature_2m_max[index],
        precipitationProbability:
          sourceData.daily.precipitation_probability_max[index],
        weatherCode: sourceData.daily.weather_code[index],
        sunrise: sourceData.daily.sunrise[index],
        sunset: sourceData.daily.sunset[index],
      })),
      risk: classifyWeatherRisk(
        current.precipitation,
        current.wind_speed_10m,
        calculateHeatIndexC(current.temperature_2m, current.relative_humidity_2m),
      ),
      riskMeasurements: {
        rainMm: current.precipitation,
        windKph: current.wind_speed_10m,
        heatIndexC: calculateHeatIndexC(
          current.temperature_2m,
          current.relative_humidity_2m,
        ),
      },
    };

    const { error: writeError } = await this.supabase
      .from('weather_cache')
      .upsert(
        { cache_key: cacheKey, data: payload, fetched_at: payload.updatedAt },
        { onConflict: 'cache_key' },
      );
    if (writeError) {
      this.logger.error(`Weather cache write failed: ${writeError.message}`);
      throw new ServiceUnavailableException(
        'Weather cache could not save the forecast. Apply the backend Supabase migration.',
      );
    }

    return payload;
  }

}

function calculateHeatIndexC(temperatureC: number, humidityPercent: number) {
  const temperatureF = (temperatureC * 9) / 5 + 32;
  if (temperatureF < 80 || humidityPercent < 40) return temperatureC;

  const heatIndexF =
    -42.379 +
    2.04901523 * temperatureF +
    10.14333127 * humidityPercent -
    0.22475541 * temperatureF * humidityPercent -
    0.00683783 * temperatureF ** 2 -
    0.05481717 * humidityPercent ** 2 +
    0.00122874 * temperatureF ** 2 * humidityPercent +
    0.00085282 * temperatureF * humidityPercent ** 2 -
    0.00000199 * temperatureF ** 2 * humidityPercent ** 2;
  return ((heatIndexF - 32) * 5) / 9;
}
