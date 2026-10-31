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
    us_aqi?: number;
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
    airQualityUsAqi: number | null;
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
    aqi: number | null;
  };
}

interface WeatherCacheEntry {
  data: WeatherForecast;
  fetched_at: string;
}

interface SavedHomeLocation {
  loc_id: number;
  user_id: string;
  label: string | null;
  full_address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
}

interface StoredWeatherRecord {
  recorded_at: string;
  temperature: number;
  rainfall: number;
  wind_speed: number;
  weather_condition: string | null;
  humidity: number | null;
  heat_index: number | null;
  uv_index: number | null;
  aqi: number | null;
}

interface WeatherMeasurements {
  rainMm: number;
  windKph: number;
  heatIndexC: number;
  temperatureC: number;
  humidityPercent: number;
  uvIndex: number;
  aqi: number | null;
  weatherCode: number;
  pressureMslHpa?: number;
  stale: boolean;
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

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly memoryCache = new Map<string, WeatherCacheEntry>();

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
      this.logger.warn(
        `Weather cache lookup failed (falling back to in-memory cache): ${cacheResult.error.message}`,
      );
    }

    const cacheValue: unknown = cacheResult.error
      ? this.memoryCache.get(cacheKey)
      : cacheResult.data;
    const cached = isWeatherCacheEntry(cacheValue)
      ? cacheValue
      : (this.memoryCache.get(cacheKey) ?? null);
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
    const fetchedAqi = await this.fetchUsAqi(latitude, longitude);
    const airQualityAqi =
      fetchedAqi ?? cached?.data.current.airQualityUsAqi ?? null;
    const heatIndexC = calculateHeatIndexC(
      current.temperature_2m,
      current.relative_humidity_2m,
    );
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
        airQualityUsAqi: airQualityAqi,
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
        heatIndexC,
        current.weather_code,
        airQualityAqi,
      ),
      riskMeasurements: {
        rainMm: current.precipitation,
        windKph: current.wind_speed_10m,
        pressureMslHpa: current.pressure_msl,
        heatIndexC,
        aqi: airQualityAqi,
      },
    };

    this.memoryCache.set(cacheKey, {
      data: payload,
      fetched_at: payload.updatedAt,
    });

    const { error: writeError } = await this.supabase
      .from('weather_cache')
      .upsert(
        { cache_key: cacheKey, data: payload, fetched_at: payload.updatedAt },
        { onConflict: 'cache_key' },
      );
    if (writeError) {
      this.logger.warn(
        `Weather cache write failed (using in-memory cache): ${writeError.message}`,
      );
    }

    return payload;
  }

  private async fetchUsAqi(latitude: number, longitude: number) {
    const url = new URL(
      'https://air-quality-api.open-meteo.com/v1/air-quality',
    );
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'us_aqi',
      timezone: 'auto',
    }).toString();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        this.logger.warn(
          `Open-Meteo air quality returned HTTP ${response.status}.`,
        );
        return null;
      }
      const value: unknown = await response.json();
      if (
        !value ||
        typeof value !== 'object' ||
        !('current' in value) ||
        typeof value.current !== 'object' ||
        value.current === null ||
        !('us_aqi' in value.current) ||
        typeof value.current.us_aqi !== 'number' ||
        !Number.isFinite(value.current.us_aqi)
      ) {
        this.logger.warn('Open-Meteo air-quality response failed validation.');
        return null;
      }
      return value.current.us_aqi;
    } catch (error) {
      this.logger.warn(
        `Open-Meteo air quality is unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  @Cron('*/10 * * * *', { waitForCompletion: true })
  async monitorSavedLocations() {
    const locationResult = await this.supabase
      .from('locations')
      .select('loc_id, user_id, label, full_address, city, latitude, longitude')
      .eq('is_default', true);
    if (locationResult.error) {
      this.logger.error(
        `Saved locations could not be loaded for weather monitoring: ${locationResult.error.message}`,
      );
      return;
    }
    const locations = (locationResult.data ?? []) as SavedHomeLocation[];
    const grouped = new Map<string, SavedHomeLocation[]>();
    for (const location of locations) {
      const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
      const group = grouped.get(key) ?? [];
      group.push(location);
      grouped.set(key, group);
    }

    for (const group of grouped.values()) {
      const representative = group[0];
      let forecast: WeatherForecast | null = null;
      let measurements: WeatherMeasurements;
      try {
        forecast = await this.getForecast(
          Number(representative.latitude.toFixed(2)),
          Number(representative.longitude.toFixed(2)),
        );
        measurements = {
          rainMm: forecast.riskMeasurements.rainMm,
          windKph: forecast.riskMeasurements.windKph,
          heatIndexC: forecast.riskMeasurements.heatIndexC,
          temperatureC: forecast.current.temperatureC,
          humidityPercent: forecast.current.humidityPercent,
          uvIndex: forecast.current.uvIndex,
          aqi: forecast.riskMeasurements.aqi,
          weatherCode: forecast.current.weatherCode,
          pressureMslHpa: forecast.current.pressureMslHpa,
          stale: forecast.stale,
        };
      } catch (error) {
        this.logger.error(
          `Weather fetch failed for ${representative.city ?? representative.loc_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        const { data: stored, error: storedError } = await this.supabase
          .from('weather_records')
          .select(
            'recorded_at,temperature,rainfall,wind_speed,weather_condition,humidity,heat_index,uv_index,aqi',
          )
          .eq('location_id', representative.loc_id)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (storedError) {
          this.logger.error(
            `Latest stored weather could not be loaded: ${storedError.message}`,
          );
          continue;
        }
        if (!isStoredWeatherRecord(stored)) {
          this.logger.warn(
            `No stored weather record is available for ${representative.city ?? representative.loc_id}.`,
          );
          continue;
        }
        measurements = {
          rainMm: stored.rainfall,
          windKph: stored.wind_speed,
          heatIndexC: stored.heat_index ?? stored.temperature,
          temperatureC: stored.temperature,
          humidityPercent: stored.humidity ?? 0,
          uvIndex: stored.uv_index ?? 0,
          aqi: stored.aqi,
          weatherCode: /thunder|storm/i.test(stored.weather_condition ?? '')
            ? 95
            : -1,
          stale: true,
        };
      }

      for (const location of group) {
        try {
          const recordedAt = new Date().toISOString();
          const condition =
            forecast?.current.weatherCode === 95 ||
            forecast?.current.weatherCode === 96 ||
            forecast?.current.weatherCode === 99
              ? 'Thunderstorm'
              : forecast
                ? `WMO ${forecast.current.weatherCode}`
                : 'Stale stored observation';
          const { error: recordError } = await this.supabase
            .from('weather_records')
            .insert({
              location_id: location.loc_id,
              temperature: measurements.temperatureC,
              rainfall: measurements.rainMm,
              wind_speed: measurements.windKph,
              weather_condition: condition,
              recorded_at: recordedAt,
              humidity: measurements.humidityPercent,
              heat_index: measurements.heatIndexC,
              uv_index: measurements.uvIndex,
              aqi: measurements.aqi,
              is_stale: measurements.stale,
            });
          if (recordError) {
            this.logger.error(
              `Weather record could not be saved: ${recordError.message}`,
            );
          }

          const hazards = detectWeatherHazards(
            measurements.rainMm,
            measurements.windKph,
            measurements.heatIndexC,
            measurements.weatherCode,
            measurements.pressureMslHpa,
            measurements.aqi,
          );
          for (const hazard of hazards) {
            const { data: previous, error: previousError } = await this.supabase
              .from('hazards')
              .select('created_at,risk_level,severity')
              .eq('location_id', location.loc_id)
              .eq('hazard_type', hazard.type)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (previousError) {
              this.logger.error(
                `Hazard cooldown could not be checked: ${previousError.message}`,
              );
              continue;
            }
            const previousRisk =
              typeof previous?.risk_level === 'string'
                ? previous.risk_level
                : typeof previous?.severity === 'string'
                  ? previous.severity
                  : 'Normal';
            const riskRank: Record<string, number> = {
              Normal: 0,
              Advisory: 1,
              Warning: 2,
              Severe: 3,
            };
            const previousCreatedAt =
              typeof previous?.created_at === 'string'
                ? Date.parse(previous.created_at)
                : Number.NaN;
            const escalated =
              riskRank[hazard.riskLevel] > (riskRank[previousRisk] ?? 0);
            const cooledDown =
              !Number.isFinite(previousCreatedAt) ||
              Date.now() - previousCreatedAt >= 6 * 60 * 60 * 1000;
            if (previous && !escalated && !cooledDown) continue;

            const place =
              location.label && location.label !== 'Home'
                ? location.label
                : location.city || location.full_address || 'Home';
            const guidance = await this.ai.generateWeatherSafetyTips({
              hazardType: hazard.type,
              riskLevel: hazard.riskLevel,
              location: place,
              measurements: {
                rainMm: measurements.rainMm,
                windKph: measurements.windKph,
                heatIndexC: measurements.heatIndexC,
                temperatureC: measurements.temperatureC,
                humidityPercent: measurements.humidityPercent,
                aqi: measurements.aqi ?? 0,
              },
            });
            const dedupeKey = [
              location.loc_id,
              hazard.type.toLocaleLowerCase().replace(/\s+/g, '-'),
              hazard.riskLevel.toLocaleLowerCase(),
              Math.floor(Date.now() / (6 * 60 * 60 * 1000)),
            ].join(':');
            const { data: savedHazard, error: hazardError } =
              await this.supabase
                .from('hazards')
                .insert({
                  location_id: location.loc_id,
                  category: hazard.type,
                  severity: hazard.riskLevel,
                  hazard_type: hazard.type,
                  risk_level: hazard.riskLevel,
                  ai_summary: guidance.summary,
                  safety_tips: {
                    do: guidance.do,
                    prepare: guidance.prepare,
                    avoid: guidance.avoid,
                  },
                  dedupe_key: dedupeKey,
                  expires_at: new Date(
                    Date.now() + 6 * 60 * 60 * 1000,
                  ).toISOString(),
                })
                .select('id')
                .single();
            if (hazardError?.code === '23505') continue;
            if (hazardError || !savedHazard) {
              this.logger.error(
                `Hazard could not be saved: ${hazardError?.message ?? 'No row returned'}`,
              );
              continue;
            }
            const hazardId = String(savedHazard.id);
            await this.push.sendUserNotification({
              userId: location.user_id,
              hazardId,
              kind: 'weather_hazard',
              sourceName: 'Open-Meteo',
              title: `${hazard.type} - ${hazard.riskLevel} near ${place}`,
              body: `${guidance.do[0]}\n${guidance.do[1]}`,
              data: { type: 'hazard', hazardId },
            });
          }
        } catch (error) {
          this.logger.error(
            `Weather monitor failed for ${location.city ?? location.loc_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }
  }
}

function isStoredWeatherRecord(value: unknown): value is StoredWeatherRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.recorded_at === 'string' &&
    typeof record.temperature === 'number' &&
    typeof record.rainfall === 'number' &&
    typeof record.wind_speed === 'number' &&
    (typeof record.weather_condition === 'string' ||
      record.weather_condition === null) &&
    (typeof record.humidity === 'number' || record.humidity === null) &&
    (typeof record.heat_index === 'number' || record.heat_index === null) &&
    (typeof record.uv_index === 'number' || record.uv_index === null) &&
    (typeof record.aqi === 'number' || record.aqi === null)
  );
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
