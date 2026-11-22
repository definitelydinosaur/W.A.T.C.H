import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import {
  classifyWeatherRisk,
  DetectedWeatherHazard,
  detectWeatherHazards,
  WeatherApiAlert,
} from './weather-risk';
import { PushService } from '../notifications/push.service';
import {
  areasMatch,
  HazardAreaLocation,
  normalizeAreaKey,
  placeName,
} from './hazard-area';
import { hazardTemplateKey, renderHazardTemplate } from './hazard-templates';
import {
  hasConsecutiveHazard,
  StoredWeatherRecord,
} from './weather-observations';

export { hasConsecutiveHazard } from './weather-observations';
export type { StoredWeatherRecord } from './weather-observations';

const CACHE_TTL_MS = 10 * 60 * 1000;
const HAZARD_DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1-hour deduplication window
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_gusts_10m?: number;
    wind_direction_10m: number;
    pressure_msl: number;
    weather_code: number;
    uv_index: number;
    us_aqi?: number;
  };
  alerts?: WeatherApiAlert[];
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
    windGustsKph?: number;
    windDirectionDegrees: number;
    pressureMslHpa: number;
    weatherCode: number;
    uvIndex: number;
    airQualityUsAqi: number | null;
  };
  alerts?: WeatherApiAlert[];
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
    windGustsKph?: number;
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
  province: string | null;
  latitude: number;
  longitude: number;
}

interface WeatherMeasurements {
  rainMm: number;
  windKph: number;
  windGustsKph?: number;
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
    private readonly push: PushService,
    private readonly config: ConfigService,
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
        'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,weather_code,uv_index',
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
    const windGustsKph =
      typeof current.wind_gusts_10m === 'number' &&
      Number.isFinite(current.wind_gusts_10m)
        ? current.wind_gusts_10m
        : undefined;
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
        windGustsKph,
        windDirectionDegrees: current.wind_direction_10m,
        pressureMslHpa: current.pressure_msl,
        weatherCode: current.weather_code,
        uvIndex: current.uv_index,
        airQualityUsAqi: airQualityAqi,
      },
      alerts: Array.isArray(sourceData.alerts) ? sourceData.alerts : undefined,
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
        windGustsKph,
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

  /**
   * Evaluates incoming weather metrics and active provider alerts against
   * critical hazard thresholds, resolves cleared hazards for the area, and
   * idempotently logs/upserts active hazards in the `hazards` table.
   */
  async evaluateAndLogHazards(
    forecast: WeatherForecast,
    context?: {
      locationId?: number;
      userId?: string;
      placeName?: string;
      previousRiskLevel?: string;
    },
  ): Promise<
    { id: string; hazard: DetectedWeatherHazard; escalated: boolean }[]
  > {
    const { latitude, longitude } = forecast.location;
    const areaKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const detectedAt = new Date().toISOString();
    const measurements = forecast.riskMeasurements;
    const rawMetrics = {
      rainMm: measurements.rainMm,
      windKph: measurements.windKph,
      windGustsKph: measurements.windGustsKph ?? null,
      heatIndexC: measurements.heatIndexC,
      pressureMslHpa: measurements.pressureMslHpa,
      temperatureC: forecast.current.temperatureC,
      humidityPercent: forecast.current.humidityPercent,
      weatherCode: forecast.current.weatherCode,
      uvIndex: forecast.current.uvIndex,
    };

    const hazards = detectWeatherHazards(
      measurements.rainMm,
      measurements.windKph,
      measurements.heatIndexC,
      forecast.current.weatherCode,
      measurements.pressureMslHpa,
      measurements.windGustsKph ?? 0,
      forecast?.alerts ?? [],
      measurements.aqi,
    );

    const activeEventTypes = hazards.map((h) => h.eventType);

    // Auto-resolve active hazards for this area that are no longer breaching thresholds
    const resolveQuery = this.supabase
      .from('hazards')
      .update({ resolved_at: detectedAt })
      .eq('area_key', areaKey)
      .is('resolved_at', null);

    const { error: resolveError } = activeEventTypes.length
      ? await resolveQuery.not(
          'event_type',
          'in',
          `(${activeEventTypes.join(',')})`,
        )
      : await resolveQuery;

    if (resolveError) {
      this.logger.warn(
        `Could not auto-resolve cleared hazards for ${areaKey}: ${resolveError.message}`,
      );
    }

    const severityRank: Record<string, number> = {
      Normal: 0,
      Advisory: 1,
      Warning: 2,
      Severe: 3,
      Extreme: 4,
    };

    const recorded: {
      id: string;
      hazard: DetectedWeatherHazard;
      escalated: boolean;
    }[] = [];

    for (const hazard of hazards) {
      const place = context?.placeName ?? forecast.location.name;
      const existingResult = await this.supabase
        .from('hazards')
        .select(
          'id, severity, risk_level, detected_at, created_at, resolved_at',
        )
        .eq('area_key', areaKey)
        .eq('event_type', hazard.eventType)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingResult.error) {
        throw new Error(
          `Hazard idempotency check failed: ${existingResult.error.message}`,
        );
      }

      const existing = existingResult.data as {
        id: string;
        severity?: string | null;
        risk_level?: string | null;
        detected_at?: string | null;
        created_at?: string | null;
        resolved_at?: string | null;
      } | null;

      const lastTimestamp = existing?.detected_at ?? existing?.created_at;
      const isCurrentlyActive = existing && existing.resolved_at === null;
      const withinDedupeWindow =
        Boolean(lastTimestamp) &&
        Date.now() - Date.parse(lastTimestamp!) < HAZARD_DEDUPE_WINDOW_MS;

      const priorSeverity =
        existing?.severity ?? existing?.risk_level ?? 'Normal';
      const escalated =
        severityRank[hazard.severity] > (severityRank[priorSeverity] ?? 0) ||
        context?.previousRiskLevel === 'Normal';

      if (existing && (isCurrentlyActive || withinDedupeWindow)) {
        // Idempotent update of existing active hazard in the same area/window
        const nextSeverity = escalated ? hazard.severity : priorSeverity;
        const nextRiskLevel =
          nextSeverity === 'Extreme'
            ? 'Severe'
            : (nextSeverity as 'Advisory' | 'Warning' | 'Severe');
        const guidance = renderHazardTemplate({
          key: hazardTemplateKey(hazard.eventType, hazard.type),
          hazardType: hazard.type,
          severity: nextSeverity,
          place,
          observedAt: detectedAt,
          sourceName: 'Open-Meteo weather data',
          measurements: {
            rainMm: measurements.rainMm,
            heatIndexC: measurements.heatIndexC,
            aqi: measurements.aqi,
          },
        });

        const { error: updateError } = await this.supabase
          .from('hazards')
          .update({
            severity: nextSeverity,
            risk_level: nextRiskLevel,
            title: guidance.title,
            description: guidance.summary,
            explanation: guidance.summary,
            ai_summary: guidance.summary,
            safety_tips: guidance.safetyTips,
            source_type: 'weather_auto',
            source_name: 'Open-Meteo weather data',
            raw_metrics: rawMetrics,
            measurements,
            observed_at: detectedAt,
            resolved_at: null,
          })
          .eq('id', existing.id);

        if (updateError) {
          throw new Error(
            `Active hazard update failed: ${updateError.message}`,
          );
        }

        if (escalated) {
          recorded.push({ id: existing.id, hazard, escalated: true });
        }
        continue;
      }

      const guidance = renderHazardTemplate({
        key: hazardTemplateKey(hazard.eventType, hazard.type),
        hazardType: hazard.type,
        severity: hazard.severity,
        place,
        observedAt: detectedAt,
        sourceName: 'Open-Meteo weather data',
        measurements: {
          rainMm: measurements.rainMm,
          heatIndexC: measurements.heatIndexC,
          aqi: measurements.aqi,
        },
      });

      const hazardInsert = await this.supabase
        .from('hazards')
        .insert({
          event_type: hazard.eventType,
          severity: hazard.severity,
          description: hazard.description,
          location_lat: latitude,
          location_lon: longitude,
          area_key: areaKey,
          raw_metrics: rawMetrics,
          detected_at: detectedAt,
          resolved_at: null,
          location_id: context?.locationId ?? null,
          user_id: context?.userId ?? null,
          hazard_type: hazard.type,
          risk_level: hazard.riskLevel,
          title: guidance.title,
          ai_summary: guidance.summary,
          safety_tips: guidance.safetyTips,
          explanation: guidance.summary,
          source_type: 'weather_auto',
          source_name: 'Open-Meteo weather data',
          measurements,
          observed_at: detectedAt,
        })
        .select('id')
        .single();

      const savedHazardId =
        typeof hazardInsert.data?.id === 'string' ? hazardInsert.data.id : null;
      if (hazardInsert.error || !savedHazardId) {
        throw new Error(
          `Hazard could not be saved: ${hazardInsert.error?.message ?? 'No row returned'}`,
        );
      }

      if (context?.userId) {
        await this.push.sendUserNotification({
          userId: context.userId,
          hazardId: savedHazardId,
          kind: 'weather',
          sourceName: 'Detected by W.A.T.C.H. from weather data',
          title: guidance.title,
          body: `${guidance.summary}\n${guidance.safetyTips.do_list[0]}`,
          data: { type: 'hazard', hazardId: savedHazardId },
        });
      }

      recorded.push({ id: savedHazardId, hazard, escalated: true });
    }

    return recorded;
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
    const { data, error } = await this.supabase
      .from('locations')
      .select(
        'loc_id,user_id,label,full_address,city,province,latitude,longitude',
      )
      .not('user_id', 'is', null);
    if (error) {
      this.logger.error(
        `Saved locations could not be loaded for weather monitoring: ${error.message}`,
      );
      return;
    }

    const locations = (data ?? []) as SavedHomeLocation[];
    const grouped = new Map<string, SavedHomeLocation[]>();
    for (const location of locations) {
      const key = normalizeAreaKey(location);
      if (!key) continue;
      const group = grouped.get(key) ?? [];
      group.push(location);
      grouped.set(key, group);
    }
    const configuredReadings = Number(
      this.config.get<string>('HAZARD_CONSECUTIVE_READINGS') ?? 2,
    );
    const requiredReadings =
      Number.isSafeInteger(configuredReadings) &&
      configuredReadings >= 2 &&
      configuredReadings <= 5
        ? configuredReadings
        : 2;

    for (const [areaKey, group] of grouped) {
      const representative = [...group].sort((a, b) => a.loc_id - b.loc_id)[0];
      const area: HazardAreaLocation = {
        city: representative.city,
        province: representative.province,
        latitude: representative.latitude,
        longitude: representative.longitude,
      };
      const place = placeName(area);
      let forecast: WeatherForecast;
      try {
        forecast = await this.getForecast(
          Number(representative.latitude.toFixed(2)),
          Number(representative.longitude.toFixed(2)),
        );
      } catch (fetchError) {
        this.logger.error(
          `Weather fetch failed for ${place}: ${errorMessage(fetchError)}`,
        );
        continue;
      }

      const measurements: WeatherMeasurements = {
        rainMm: forecast.riskMeasurements.rainMm,
        windKph: forecast.riskMeasurements.windKph,
        windGustsKph: forecast.riskMeasurements.windGustsKph,
        heatIndexC: forecast.riskMeasurements.heatIndexC,
        temperatureC: forecast.current.temperatureC,
        humidityPercent: forecast.current.humidityPercent,
        uvIndex: forecast.current.uvIndex,
        aqi: forecast.riskMeasurements.aqi,
        weatherCode: forecast.current.weatherCode,
        pressureMslHpa: forecast.riskMeasurements.pressureMslHpa,
        stale: forecast.stale,
      };
      const observedAt = forecast.updatedAt;
      const condition =
        measurements.weatherCode === 95 ||
        measurements.weatherCode === 96 ||
        measurements.weatherCode === 99
          ? 'Thunderstorm'
          : `WMO ${measurements.weatherCode}`;

      for (const location of group) {
        const { error: recordError } = await this.supabase
          .from('weather_records')
          .insert({
            location_id: location.loc_id,
            temperature: measurements.temperatureC,
            rainfall: measurements.rainMm,
            wind_speed: measurements.windKph,
            weather_condition: condition,
            recorded_at: observedAt,
            humidity: measurements.humidityPercent,
            heat_index: measurements.heatIndexC,
            uv_index: measurements.uvIndex,
            aqi: measurements.aqi,
            is_stale: measurements.stale,
          });
        if (recordError) {
          this.logger.error(
            `Weather record for ${location.loc_id} could not be saved: ${recordError.message}`,
          );
        }
      }
      if (measurements.stale) {
        this.logger.warn(
          `Stale weather data for ${place} was stored for display but not used to create or resolve alerts.`,
        );
        continue;
      }

      const { data: observations, error: observationsError } =
        await this.supabase
          .from('weather_records')
          .select(
            'recorded_at,temperature,rainfall,wind_speed,weather_condition,humidity,heat_index,uv_index,aqi,is_stale',
          )
          .eq('location_id', representative.loc_id)
          .eq('is_stale', false)
          .order('recorded_at', { ascending: false })
          .limit(requiredReadings);
      if (observationsError) {
        this.logger.error(
          `Recent observations for ${place} could not be loaded: ${observationsError.message}`,
        );
        continue;
      }
      const recent = (observations ?? []).filter(isStoredWeatherRecord);
      const hazards = detectWeatherHazards(
        measurements.rainMm,
        measurements.windKph,
        measurements.heatIndexC,
        measurements.weatherCode,
        measurements.pressureMslHpa,
        measurements.windGustsKph ?? 0,
        forecast.alerts ?? [],
        measurements.aqi,
      );
      const confirmed = hazards.filter((candidate) =>
        hasConsecutiveHazard(candidate.type, recent, requiredReadings),
      );

      const { data: activeRows, error: activeError } = await this.supabase
        .from('hazards')
        .select('id,event_type,hazard_type')
        .eq('area_key', areaKey)
        .is('resolved_at', null);
      if (activeError) {
        this.logger.error(
          `Active hazards for ${place} could not be loaded: ${activeError.message}`,
        );
        continue;
      }
      if (recent.length === requiredReadings) {
        const activeTypes = new Set(
          recent.flatMap((record) =>
            detectWeatherHazards(
              record.rainfall,
              record.wind_speed,
              record.heat_index ?? record.temperature,
              /thunder|storm/i.test(record.weather_condition ?? '') ? 95 : -1,
              undefined,
              0,
              [],
              record.aqi,
            ).map((candidate) => candidate.type),
          ),
        );
        for (const active of activeRows ?? []) {
          const type =
            typeof active.hazard_type === 'string'
              ? active.hazard_type
              : typeof active.event_type === 'string'
                ? active.event_type
                : '';
          if (type && !activeTypes.has(type)) {
            const { error: resolveError } = await this.supabase
              .from('hazards')
              .update({ resolved_at: observedAt })
              .eq('id', active.id);
            if (resolveError) {
              this.logger.error(
                `Cleared hazard ${active.id} could not be resolved: ${resolveError.message}`,
              );
            }
          }
        }
      }

      for (const candidate of confirmed) {
        const { data: existing, error: existingError } = await this.supabase
          .from('hazards')
          .select('id,severity,risk_level')
          .eq('area_key', areaKey)
          .eq('event_type', candidate.eventType)
          .is('resolved_at', null)
          .maybeSingle();
        if (existingError) {
          this.logger.error(
            `Active hazard for ${place} could not be checked: ${existingError.message}`,
          );
          continue;
        }
        const severityRank: Record<string, number> = {
          Advisory: 1,
          Warning: 2,
          Severe: 3,
          Extreme: 4,
        };
        const previousSeverity =
          typeof existing?.severity === 'string'
            ? existing.severity
            : typeof existing?.risk_level === 'string'
              ? existing.risk_level
              : 'Advisory';
        const severity =
          (severityRank[candidate.severity] ?? 0) >
          (severityRank[previousSeverity] ?? 0)
            ? candidate.severity
            : previousSeverity;
        const rendered = renderHazardTemplate({
          key: hazardTemplateKey(candidate.eventType, candidate.type),
          hazardType: candidate.type,
          severity,
          place,
          observedAt,
          sourceName: 'Open-Meteo weather data',
          measurements: {
            rainMm: measurements.rainMm,
            heatIndexC: measurements.heatIndexC,
            aqi: measurements.aqi,
          },
        });
        const row = {
          event_type: candidate.eventType,
          severity,
          risk_level: candidate.riskLevel,
          category: candidate.type,
          hazard_type: candidate.type,
          title: rendered.title,
          description: rendered.summary,
          explanation: rendered.summary,
          ai_summary: rendered.summary,
          safety_tips: rendered.safetyTips,
          source_type: 'weather_auto',
          source_name: 'Open-Meteo weather data',
          source_url: null,
          city: area.city,
          province: area.province,
          location_lat: representative.latitude,
          location_lon: representative.longitude,
          area_key: areaKey,
          location_id: representative.loc_id,
          user_id: null,
          measurements,
          raw_metrics: measurements,
          observed_at: observedAt,
          detected_at: observedAt,
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          resolved_at: null,
        };
        let hazardId = typeof existing?.id === 'string' ? existing.id : null;
        if (hazardId) {
          const { error: updateError } = await this.supabase
            .from('hazards')
            .update(row)
            .eq('id', hazardId);
          if (updateError) {
            this.logger.error(
              `Active hazard for ${place} could not be updated: ${updateError.message}`,
            );
            continue;
          }
        } else {
          const { data: inserted, error: insertError } = await this.supabase
            .from('hazards')
            .insert({
              ...row,
              dedupe_key: `${areaKey}:${candidate.eventType}:${Date.now()}`,
            })
            .select('id')
            .maybeSingle();
          if (insertError?.code === '23505') {
            const { data: concurrent, error: concurrentError } =
              await this.supabase
                .from('hazards')
                .select('id')
                .eq('area_key', areaKey)
                .eq('event_type', candidate.eventType)
                .is('resolved_at', null)
                .maybeSingle();
            if (concurrentError || !concurrent?.id) {
              this.logger.error(
                `Concurrent hazard could not be recovered: ${concurrentError?.message ?? insertError.message}`,
              );
              continue;
            }
            hazardId = String(concurrent.id);
          } else if (insertError || !inserted?.id) {
            this.logger.error(
              `Hazard for ${place} could not be saved: ${insertError?.message ?? 'No row returned'}`,
            );
            continue;
          } else {
            hazardId = String(inserted.id);
          }
        }
        if (!hazardId) continue;
        const userIds = [
          ...new Set(
            group
              .map((location) => location.user_id)
              .filter((userId): userId is string => Boolean(userId)),
          ),
        ];
        const { data: existingNotifications, error: notificationError } =
          await this.supabase
            .from('notifications')
            .select('user_id')
            .eq('hazard_id', hazardId)
            .in('user_id', userIds);
        if (notificationError) {
          this.logger.error(
            `Hazard notification recipients could not be checked: ${notificationError.message}`,
          );
          continue;
        }
        const alreadyNotified = new Set(
          (existingNotifications ?? []).map(
            (notification) => notification.user_id,
          ),
        );
        for (const userId of userIds) {
          if (alreadyNotified.has(userId)) continue;
          await this.push.sendUserNotification({
            userId,
            hazardId,
            kind: 'weather_hazard',
            sourceName: 'Detected by W.A.T.C.H. from weather data',
            title: rendered.title,
            body: `${rendered.summary}\n${rendered.safetyTips.do_list[0]}`,
            data: { type: 'hazard', hazardId },
          });
        }
      }
    }
  }

  async monitorLegacySavedLocations() {
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
          windGustsKph: forecast.riskMeasurements.windGustsKph,
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
            const observedAt = new Date().toISOString();
            const guidance = renderHazardTemplate({
              key: hazardTemplateKey(hazard.eventType, hazard.type),
              hazardType: hazard.type,
              severity: hazard.severity,
              place,
              observedAt,
              sourceName: 'Open-Meteo weather data',
              measurements: {
                rainMm: measurements.rainMm,
                heatIndexC: measurements.heatIndexC,
                aqi: measurements.aqi,
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
                  title: guidance.title,
                  ai_summary: guidance.summary,
                  safety_tips: guidance.safetyTips,
                  source_type: 'weather_auto',
                  source_name: 'Open-Meteo weather data',
                  city: location.city,
                  province: location.province,
                  observed_at: observedAt,
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
              sourceName: 'Detected by W.A.T.C.H. from weather data',
              title: guidance.title,
              body: `${guidance.summary}\n${guidance.safetyTips.do_list[0]}`,
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

  @Cron('*/30 * * * *', { waitForCompletion: true })
  async sendOngoingHazardSafetyTips() {
    const configuredInterval = Number(
      this.config.get<string>('SAFETY_TIP_INTERVAL_HOURS') ?? 3,
    );
    const intervalHours =
      Number.isFinite(configuredInterval) &&
      configuredInterval >= 2 &&
      configuredInterval <= 3
        ? configuredInterval
        : 3;
    const configuredMaximum = Number(
      this.config.get<string>('SAFETY_TIP_MAX_PER_HAZARD_USER') ?? 3,
    );
    const maximumTips =
      Number.isSafeInteger(configuredMaximum) &&
      configuredMaximum >= 1 &&
      configuredMaximum <= 5
        ? configuredMaximum
        : 3;
    const now = new Date();
    const expectedExpiry = new Date(
      now.getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();
    const { data: hazards, error: hazardError } = await this.supabase
      .from('hazards')
      .select(
        'id,location_id,area_key,city,province,location_lat,location_lon,event_type,hazard_type,risk_level,severity,safety_tips,observed_at,source_type',
      )
      .is('resolved_at', null)
      .gt('expires_at', expectedExpiry)
      .lt(
        'created_at',
        new Date(now.getTime() - intervalHours * 60 * 60 * 1000).toISOString(),
      )
      .limit(200);
    if (hazardError) {
      this.logger.error(
        `Active hazards could not be loaded for safety tips: ${hazardError.message}`,
      );
      return;
    }

    for (const hazard of hazards ?? []) {
      const locationId = Number(hazard.location_id);
      if (!Number.isSafeInteger(locationId) || locationId < 1) continue;

      const { data: weatherRecord, error: weatherError } = await this.supabase
        .from('weather_records')
        .select(
          'recorded_at,temperature,rainfall,wind_speed,weather_condition,humidity,heat_index,uv_index,aqi,is_stale',
        )
        .eq('location_id', locationId)
        .gte(
          'recorded_at',
          new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
        )
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (weatherError) {
        this.logger.error(
          `Current hazard measurements could not be checked: ${weatherError.message}`,
        );
        continue;
      }
      if (
        !isStoredWeatherRecord(weatherRecord) ||
        weatherRecord.is_stale === true ||
        !detectWeatherHazards(
          weatherRecord.rainfall,
          weatherRecord.wind_speed,
          weatherRecord.heat_index ?? weatherRecord.temperature,
          /thunder|storm/i.test(weatherRecord.weather_condition ?? '')
            ? 95
            : -1,
          undefined,
          0,
          [],
          weatherRecord.aqi,
        ).some((active) => active.type === hazard.hazard_type)
      ) {
        continue;
      }

      const { data: locations, error: locationsError } = await this.supabase
        .from('locations')
        .select('user_id,city,province,latitude,longitude');
      if (locationsError) {
        this.logger.error(
          `Saved locations for safety tips could not be loaded: ${locationsError.message}`,
        );
        continue;
      }
      const hazardArea: HazardAreaLocation = {
        city: hazard.city ?? null,
        province: hazard.province ?? null,
        latitude:
          typeof hazard.location_lat === 'number' ? hazard.location_lat : null,
        longitude:
          typeof hazard.location_lon === 'number' ? hazard.location_lon : null,
      };
      const userIds = [
        ...new Set(
          (locations ?? [])
            .filter(
              (location) =>
                location.user_id &&
                areasMatch(hazardArea, location as HazardAreaLocation),
            )
            .map((location) => location.user_id as string),
        ),
      ];
      if (!userIds.length) continue;
      const { data: profiles, error: profileError } = await this.supabase
        .from('user_info')
        .select('id,notification_prefs')
        .in('id', userIds);
      if (profileError) {
        this.logger.error(
          `Safety-tip audience could not be loaded: ${profileError.message}`,
        );
        continue;
      }
      const audience = (profiles ?? []).filter((profile) => {
        const prefs = isRecord(profile.notification_prefs)
          ? profile.notification_prefs
          : {};
        return prefs.weather !== false && prefs.safety !== false;
      });
      if (!audience.length) continue;

      const measurements: Record<string, number> = {
        temperatureC: weatherRecord.temperature,
        rainMm: weatherRecord.rainfall,
        windKph: weatherRecord.wind_speed,
        heatIndexC: weatherRecord.heat_index ?? weatherRecord.temperature,
        humidityPercent: weatherRecord.humidity ?? 0,
        aqi: weatherRecord.aqi ?? 0,
      };
      const place = placeName(hazardArea);
      const template = renderHazardTemplate({
        key: hazardTemplateKey(hazard.event_type, hazard.hazard_type),
        hazardType: hazard.hazard_type ?? 'Weather hazard',
        severity: hazard.severity ?? hazard.risk_level ?? 'Advisory',
        place,
        observedAt: hazard.observed_at ?? weatherRecord.recorded_at,
        sourceName:
          hazard.source_type === 'weather_auto'
            ? 'Open-Meteo weather data'
            : 'W.A.T.C.H. weather data',
        measurements: {
          heatIndexC: measurements.heatIndexC,
          rainMm: measurements.rainMm,
          aqi: measurements.aqi,
        },
      });
      const tip = {
        title: template.title,
        short_summary: template.summary,
        do_list: template.safetyTips.do_list,
        dont_list: template.safetyTips.dont_list,
        prepare_list: template.safetyTips.prepare_list,
        emergency_note: template.safetyTips.emergency_note,
        version: template.safetyTips.version,
      };
      const tipKey = createHash('sha256')
        .update(
          JSON.stringify([
            tip.title,
            tip.short_summary,
            tip.do_list,
            tip.dont_list,
            tip.emergency_note,
          ]),
        )
        .digest('hex')
        .slice(0, 24);
      const { error: tipsUpdateError } = await this.supabase
        .from('hazards')
        .update({
          safety_tips: {
            ...(isRecord(hazard.safety_tips) ? hazard.safety_tips : {}),
            ongoing_tip: { ...tip, tip_key: tipKey },
          },
        })
        .eq('id', hazard.id);
      if (tipsUpdateError) {
        this.logger.error(
          `Ongoing safety tips could not be saved: ${tipsUpdateError.message}`,
        );
        continue;
      }

      for (const profile of audience) {
        const { data: recentTips, error: recentError } = await this.supabase
          .from('notifications')
          .select('id,created_at')
          .eq('user_id', profile.id)
          .eq('hazard_id', hazard.id)
          .eq('kind', 'safety_tip')
          .order('created_at', { ascending: false })
          .limit(maximumTips);
        if (recentError) {
          this.logger.error(
            `Prior safety tips could not be checked: ${recentError.message}`,
          );
          continue;
        }
        if ((recentTips ?? []).length >= maximumTips) continue;
        const latestTip = recentTips?.[0];
        if (
          latestTip &&
          Date.now() - Date.parse(latestTip.created_at) <
            intervalHours * 60 * 60 * 1000
        ) {
          continue;
        }
        const { data: duplicateTip, error: duplicateError } =
          await this.supabase
            .from('notifications')
            .select('id')
            .eq('user_id', profile.id)
            .eq('hazard_id', hazard.id)
            .eq('kind', 'safety_tip')
            .eq('data->>tip_key', tipKey)
            .maybeSingle();
        if (duplicateError) {
          this.logger.error(
            `Safety-tip deduplication check failed: ${duplicateError.message}`,
          );
          continue;
        }
        if (duplicateTip) continue;
        await this.push.sendUserNotification({
          userId: profile.id,
          hazardId: String(hazard.id),
          kind: 'safety_tip',
          sourceName: hazard.hazard_type ?? 'Weather hazard',
          title: tip.title,
          body: tip.short_summary,
          data: { tip_key: tipKey },
        });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
