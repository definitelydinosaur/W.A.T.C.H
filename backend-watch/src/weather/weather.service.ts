import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { classifyWeatherRisk, detectWeatherHazards } from './weather-risk';
import { AiService } from '../ai/ai.service';
import { PushService } from '../notifications/push.service';

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
    pressure_msl: number;
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

export interface WeatherForecast {
  location: { name: string; latitude: number; longitude: number };
  updatedAt: string;
  source: string;
  stale: boolean;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    precipitationMm: number;
    windKph: number;
    windDirectionDegrees: number;
    pressureMslHpa: number;
    weatherCode: number;
    uvIndex: number;
  };
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
    weatherCode: number;
    sunrise: string;
    sunset: string;
  }[];
  risk: { level: string; reason: string };
  riskMeasurements: {
    rainMm: number;
    windKph: number;
    pressureMslHpa: number;
    heatIndexC: number;
  };
}

interface WeatherCacheEntry {
  data: WeatherForecast;
  fetched_at: string;
}

interface WeatherState {
  risk_level: string;
  observed_at?: string;
}

interface HazardState {
  risk_level: string;
  created_at: string;
}

interface SavedHomeLocation {
  id: string;
  user_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
}

function isValidOpenMeteoResponse(value: unknown): value is OpenMeteoResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<OpenMeteoResponse>;
  const current = result.current;
  const hourly = result.hourly;
  const daily = result.daily;
  if (!current || !hourly || !daily) return false;
  if (
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    !Array.isArray(hourly.precipitation_probability) ||
    !Array.isArray(hourly.weather_code) ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.precipitation_probability_max) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.sunrise) ||
    !Array.isArray(daily.sunset)
  ) {
    return false;
  }
  const isFiniteNumberArray = (items: unknown[]) =>
    items.every((item) => typeof item === 'number' && Number.isFinite(item));
  const isStringArray = (items: unknown[]) =>
    items.every((item) => typeof item === 'string');
  if (
    !isStringArray(hourly.time) ||
    !isFiniteNumberArray(hourly.temperature_2m) ||
    !isFiniteNumberArray(hourly.precipitation_probability) ||
    !isFiniteNumberArray(hourly.weather_code) ||
    !isStringArray(daily.time) ||
    !isFiniteNumberArray(daily.temperature_2m_max) ||
    !isFiniteNumberArray(daily.temperature_2m_min) ||
    !isFiniteNumberArray(daily.precipitation_probability_max) ||
    !isFiniteNumberArray(daily.weather_code) ||
    !isStringArray(daily.sunrise) ||
    !isStringArray(daily.sunset)
  ) {
    return false;
  }
  const currentValues = [
    current?.temperature_2m,
    current?.apparent_temperature,
    current?.relative_humidity_2m,
    current?.precipitation,
    current?.wind_speed_10m,
    current?.wind_direction_10m,
    current?.pressure_msl,
    current?.weather_code,
    current?.uv_index,
  ];
  return (
    typeof current?.time === 'string' &&
    Number.isFinite(Date.parse(current.time)) &&
    currentValues.every(
      (item) => typeof item === 'number' && Number.isFinite(item),
    ) &&
    Boolean(hourly.time.length) &&
    hourly.time.length === hourly.temperature_2m.length &&
    hourly.time.length === hourly.precipitation_probability.length &&
    hourly.time.length === hourly.weather_code.length &&
    Boolean(daily.time.length) &&
    daily.time.length === daily.temperature_2m_max.length &&
    daily.time.length === daily.temperature_2m_min.length &&
    daily.time.length === daily.precipitation_probability_max.length &&
    daily.time.length === daily.weather_code.length &&
    daily.time.length === daily.sunrise.length &&
    daily.time.length === daily.sunset.length
  );
}

function isWeatherCacheEntry(value: unknown): value is WeatherCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.fetched_at !== 'string' ||
    !Number.isFinite(Date.parse(record.fetched_at)) ||
    !record.data ||
    typeof record.data !== 'object'
  ) {
    return false;
  }
  const data = record.data as Record<string, unknown>;
  return (
    typeof data.updatedAt === 'string' &&
    typeof data.stale === 'boolean' &&
    typeof data.source === 'string' &&
    typeof data.location === 'object' &&
    typeof data.current === 'object' &&
    Array.isArray(data.hourly) &&
    Array.isArray(data.daily) &&
    typeof data.risk === 'object' &&
    typeof data.riskMeasurements === 'object'
  );
}

function isWeatherState(value: unknown): value is WeatherState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'risk_level' in value &&
    typeof value.risk_level === 'string'
  );
}

function isHazardState(value: unknown): value is HazardState {
  return (
    isWeatherState(value) &&
    'created_at' in value &&
    typeof value.created_at === 'string'
  );
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly ai: AiService,
    private readonly push: PushService,
  ) {}

  async getForecast(
    latitude: number,
    longitude: number,
  ): Promise<WeatherForecast> {
    const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cacheResult = await this.supabase
      .from('weather_cache')
      .select('data, fetched_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheResult.error) {
      this.logger.error(
        `Weather cache lookup failed: ${cacheResult.error.message}`,
      );
      throw new ServiceUnavailableException(
        'Weather cache is unavailable. Apply the backend Supabase migration.',
      );
    }

    const cacheValue: unknown = cacheResult.data;
    const cached = isWeatherCacheEntry(cacheValue) ? cacheValue : null;
    if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_TTL_MS) {
      return cached.data;
    }

    const url = new URL(OPEN_METEO_URL);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code,uv_index',
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
      throw new ServiceUnavailableException(
        'Weather provider returned an error.',
      );
    }

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch (error) {
      this.logger.error(
        `Open-Meteo returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      if (cached) return { ...cached.data, stale: true };
      throw new ServiceUnavailableException(
        'Weather provider returned invalid data.',
      );
    }
    if (!isValidOpenMeteoResponse(responseData)) {
      this.logger.error('Open-Meteo response failed weather data validation.');
      if (cached) return { ...cached.data, stale: true };
      throw new ServiceUnavailableException(
        'Weather provider returned invalid weather data.',
      );
    }
    const sourceData = responseData;
    const current = sourceData.current;
    const payload: WeatherForecast = {
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
        pressureMslHpa: current.pressure_msl,
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
        calculateHeatIndexC(
          current.temperature_2m,
          current.relative_humidity_2m,
        ),
        current.weather_code,
      ),
      riskMeasurements: {
        rainMm: current.precipitation,
        windKph: current.wind_speed_10m,
        pressureMslHpa: current.pressure_msl,
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

  @Cron('*/10 * * * *', { waitForCompletion: true })
  async monitorSavedLocations() {
    const locationResult = await this.supabase
      .from('locations')
      .select('id, user_id, label, address, city, latitude, longitude')
      .eq('is_default', true);
    if (locationResult.error) {
      this.logger.error(
        `Saved locations could not be loaded for weather monitoring: ${locationResult.error.message}`,
      );
      return;
    }
    const locations = (locationResult.data ?? []) as SavedHomeLocation[];

    for (const location of locations ?? []) {
      try {
        const forecast = await this.getForecast(
          location.latitude,
          location.longitude,
        );
        const measurements = forecast.riskMeasurements;
        const risk = forecast.risk;
        const observedAt = new Date().toISOString();
        const previousResult = await this.supabase
          .from('weather_records')
          .select('risk_level, observed_at')
          .eq('location_id', location.id)
          .order('observed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (previousResult.error)
          throw new Error(
            `Previous weather state could not be loaded: ${previousResult.error.message}`,
          );
        const previousValue: unknown = previousResult.data;
        const previous = isWeatherState(previousValue) ? previousValue : null;

        const { error: recordError } = await this.supabase
          .from('weather_records')
          .insert({
            location_id: location.id,
            user_id: location.user_id,
            payload: forecast,
            risk_level: risk.level,
            observed_at: observedAt,
          });
        if (recordError)
          throw new Error(
            `Weather record could not be saved: ${recordError.message}`,
          );

        const hazards = detectWeatherHazards(
          measurements.rainMm,
          measurements.windKph,
          measurements.heatIndexC,
          forecast.current.weatherCode,
          forecast.current.pressureMslHpa,
        );
        for (const hazard of hazards) {
          const riskRank: Record<string, number> = {
            Normal: 0,
            Advisory: 1,
            Warning: 2,
            Severe: 3,
          };
          const lastHazardResult = await this.supabase
            .from('hazards')
            .select('created_at, risk_level')
            .eq('location_id', location.id)
            .eq('user_id', location.user_id)
            .eq('hazard_type', hazard.type)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastHazardResult.error)
            throw new Error(
              `Hazard cooldown could not be checked: ${lastHazardResult.error.message}`,
            );
          const lastHazardValue: unknown = lastHazardResult.data;
          const lastHazard = isHazardState(lastHazardValue)
            ? lastHazardValue
            : null;
          const previousRisk = lastHazard?.risk_level ?? 'Normal';
          const escalated =
            riskRank[hazard.riskLevel] > (riskRank[previousRisk] ?? 0) ||
            previous?.risk_level === 'Normal';
          const cooledDown =
            !lastHazard ||
            Date.now() - Date.parse(lastHazard.created_at) >=
              6 * 60 * 60 * 1000;
          if (!escalated && !cooledDown) continue;

          const place =
            location.label && location.label !== 'Home'
              ? location.label
              : location.city || location.address || 'Home';
          const safetyTips = await this.ai.generateWeatherSafetyTips({
            hazardType: hazard.type,
            riskLevel: hazard.riskLevel,
            location: place,
            measurements,
          });
          const explanation = `Rule-based weather monitoring classified conditions as ${hazard.riskLevel}.`;
          const hazardInsert = await this.supabase
            .from('hazards')
            .insert({
              location_id: location.id,
              user_id: location.user_id,
              hazard_type: hazard.type,
              risk_level: hazard.riskLevel,
              safety_tips: safetyTips,
              explanation,
              measurements,
            })
            .select('id')
            .single();
          const savedHazardId =
            typeof hazardInsert.data?.id === 'string'
              ? hazardInsert.data.id
              : null;
          if (hazardInsert.error || !savedHazardId) {
            throw new Error(
              `Hazard could not be saved: ${hazardInsert.error?.message ?? 'No row returned'}`,
            );
          }
          await this.push.sendUserNotification({
            userId: location.user_id,
            hazardId: savedHazardId,
            title: `${hazard.type} - ${hazard.riskLevel} for ${place}`,
            body: `${safetyTips.join('\n')}\nFollow official PAGASA/LGU advisories.`,
            data: { type: 'hazard', hazardId: savedHazardId },
          });
        }
      } catch (error) {
        this.logger.error(
          `Weather monitor failed for ${location.city ?? location.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
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
