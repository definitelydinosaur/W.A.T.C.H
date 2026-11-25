import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { HazardSeverity, LatLngPoint } from './cebu-basins';
import { MapHazardsQueryDto } from './dto/map-hazards-query.dto';

export type SpatialHazardCategory = 'flood' | 'closure' | 'caution';
export type HazardSourceType =
  | 'pagasa'
  | 'project_noah'
  | 'ndrrmc_ocd'
  | 'lgu_official'
  | 'weather_auto';

export interface SpatialHazardResponse {
  id: string;
  type: SpatialHazardCategory;
  title: string;
  description: string;
  severity: HazardSeverity;
  eventType: string | null;
  barangay: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  polygon: LatLngPoint[][] | null;
  path: LatLngPoint[] | null;
  radiusM: number | null;
  sourceType: HazardSourceType;
  sourceName: string;
  sourceUrl: string | null;
  incidentGroup: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  status: 'active' | 'resolved';
  safetyTips: { do: string[]; prepare: string[]; avoid: string[] } | null;
}

export interface HistoryDaySummary {
  date: string;
  count: number;
  peakSeverity: HazardSeverity | null;
}

export interface HazardBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface MajorHistoricalEventSummary {
  incidentGroup: string;
  title: string;
  startDate: string;
  endDate: string;
  hazardCount: number;
  cities: string[];
  peakSeverity: HazardSeverity;
  sources: string[];
  bounds: HazardBounds;
}

export interface HazardHistoryIndexResponse {
  liveCount: number;
  days: HistoryDaySummary[];
  events: MajorHistoricalEventSummary[];
  updatedAt: string;
}

const SEVERITY_RANK: Record<HazardSeverity, number> = {
  Advisory: 1,
  Warning: 2,
  Severe: 3,
  Extreme: 4,
};

const SPATIAL_HAZARD_SELECT =
  'id,map_category,title,description,explanation,event_type,hazard_type,severity,risk_level,barangay,city,latitude,longitude,location_lat,location_lon,polygon,path,radius_m,source_type,source_name,source_url,incident_group,started_at,detected_at,created_at,resolved_at,safety_tips';

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

export interface MapSuggestion {
  name: string;
  detail: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  barangay: string;
}

interface PhotonFeature {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    country?: string;
    state?: string;
    city?: string;
    county?: string;
    district?: string;
    locality?: string;
    suburb?: string;
    street?: string;
    housenumber?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private readonly cache = new Map<string, GeocodeResult>();
  private readonly suggestionCache = new Map<string, MapSuggestion[]>();
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(
    @Optional() @Inject(SUPABASE_CLIENT) private readonly supabase?: SupabaseClient,
  ) { }

  async getMapHazards(query: MapHazardsQueryDto) {
    if (!this.supabase) {
      throw new ServiceUnavailableException(
        'Database client is not configured for map hazards.',
      );
    }

    const mode = query.mode ?? 'live';
    const city = query.city?.trim() || null;

    if (mode === 'date' && !query.date) {
      throw new BadRequestException(
        'Provide a date (YYYY-MM-DD) when mode=date.',
      );
    }
    if (mode === 'event' && !query.incidentGroup?.trim()) {
      throw new BadRequestException(
        'Provide an incidentGroup when mode=event.',
      );
    }

    let rawRows: unknown[] = [];

    if (mode === 'live') {
      let builder = this.supabase
        .from('hazards')
        .select(SPATIAL_HAZARD_SELECT)
        .not('map_category', 'is', null)
        .is('resolved_at', null);
      if (city) {
        builder = builder.ilike('city', city);
      }
      const { data, error } = await builder
        .order('started_at', { ascending: false })
        .limit(300);
      if (error) {
        throw new ServiceUnavailableException(
          `Active map hazards could not be loaded: ${error.message}`,
        );
      }
      rawRows = Array.isArray(data) ? data : [];
    } else if (mode === 'event') {
      const incidentGroup = query.incidentGroup!.trim();
      let builder = this.supabase
        .from('hazards')
        .select(SPATIAL_HAZARD_SELECT)
        .not('map_category', 'is', null)
        .eq('incident_group', incidentGroup);
      if (city) {
        builder = builder.ilike('city', city);
      }
      const { data, error } = await builder
        .order('started_at', { ascending: false })
        .limit(300);
      if (error) {
        throw new ServiceUnavailableException(
          `Event hazards could not be loaded: ${error.message}`,
        );
      }
      rawRows = Array.isArray(data) ? data : [];
    } else {
      const date = query.date!;
      const pStart = `${date}T00:00:00+08:00`;
      const pEnd = `${date}T23:59:59.999+08:00`;
      const { data, error } = await this.supabase.rpc(
        'get_map_hazards_by_range',
        {
          p_start: pStart,
          p_end: pEnd,
          p_include_active: true,
          p_city: city,
        },
      );
      if (error) {
        if (
          error.code === 'PGRST202' ||
          error.message.includes('get_map_hazards_by_range')
        ) {
          let fallback = this.supabase
            .from('hazards')
            .select(SPATIAL_HAZARD_SELECT)
            .not('map_category', 'is', null)
            .lte('started_at', pEnd)
            .or(`resolved_at.is.null,resolved_at.gte.${pStart}`);
          if (city) {
            fallback = fallback.ilike('city', city);
          }
          const fb = await fallback
            .order('started_at', { ascending: false })
            .limit(300);
          if (fb.error) {
            throw new ServiceUnavailableException(
              `Historical hazards could not be loaded: ${fb.error.message}`,
            );
          }
          rawRows = Array.isArray(fb.data) ? fb.data : [];
        } else {
          throw new ServiceUnavailableException(
            `Historical hazards could not be loaded: ${error.message}`,
          );
        }
      } else {
        rawRows = Array.isArray(data) ? data : [];
      }
    }

    let hazards = rawRows
      .map(normalizeSpatialHazard)
      .filter((item): item is SpatialHazardResponse => item !== null)
      .sort(
        (a, b) =>
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          Date.parse(b.reportedAt) - Date.parse(a.reportedAt),
      );

    if (
      typeof query.lat === 'number' &&
      Number.isFinite(query.lat) &&
      typeof query.lon === 'number' &&
      Number.isFinite(query.lon) &&
      typeof query.radiusKm === 'number' &&
      Number.isFinite(query.radiusKm)
    ) {
      const targetLat = query.lat;
      const targetLon = query.lon;
      const radiusKm = query.radiusKm;
      hazards = hazards.filter((h) =>
        isHazardWithinRadius(h, targetLat, targetLon, radiusKm),
      );
    }

    return {
      mode,
      date: query.date ?? null,
      incidentGroup: query.incidentGroup?.trim() ?? null,
      hazards,
      updatedAt: new Date().toISOString(),
    };
  }

  async getHistoryIndex(): Promise<HazardHistoryIndexResponse> {
    if (!this.supabase) {
      throw new ServiceUnavailableException(
        'Database client is not configured for map history.',
      );
    }

    const recentDates = buildManilaRecentDates(30);
    const oldestDate = recentDates[recentDates.length - 1];
    const windowStartIso = `${oldestDate}T00:00:00+08:00`;

    const [recentRes, eventsRes] = await Promise.all([
      this.supabase
        .from('hazards')
        .select(SPATIAL_HAZARD_SELECT)
        .not('map_category', 'is', null)
        .or(`resolved_at.is.null,resolved_at.gte.${windowStartIso}`)
        .limit(1000),
      this.supabase
        .from('hazards')
        .select(SPATIAL_HAZARD_SELECT)
        .not('map_category', 'is', null)
        .not('incident_group', 'is', null)
        .limit(1000),
    ]);

    if (recentRes.error) {
      throw new ServiceUnavailableException(
        `Map history index could not be loaded: ${recentRes.error.message}`,
      );
    }
    if (eventsRes.error) {
      throw new ServiceUnavailableException(
        `Historical events index could not be loaded: ${eventsRes.error.message}`,
      );
    }

    const recentHazards = (Array.isArray(recentRes.data) ? recentRes.data : [])
      .map(normalizeSpatialHazard)
      .filter((item): item is SpatialHazardResponse => item !== null);

    const liveCount = recentHazards.filter(
      (item) => item.status === 'active',
    ).length;

    const days: HistoryDaySummary[] = recentDates.map((date) => {
      const startMs = Date.parse(`${date}T00:00:00+08:00`);
      const endMs = Date.parse(`${date}T23:59:59.999+08:00`);
      const overlapping = recentHazards.filter((hazard) => {
        const startedMs = Date.parse(hazard.reportedAt);
        const resolvedMs = hazard.resolvedAt
          ? Date.parse(hazard.resolvedAt)
          : Infinity;
        return startedMs <= endMs && resolvedMs >= startMs;
      });
      const peakSeverity = overlapping.reduce<HazardSeverity | null>(
        (best, item) =>
          !best || SEVERITY_RANK[item.severity] > SEVERITY_RANK[best]
            ? item.severity
            : best,
        null,
      );
      return {
        date,
        count: overlapping.length,
        peakSeverity,
      };
    });

    const eventHazards = (Array.isArray(eventsRes.data) ? eventsRes.data : [])
      .map(normalizeSpatialHazard)
      .filter((item): item is SpatialHazardResponse => item !== null);

    const grouped = new Map<string, SpatialHazardResponse[]>();
    for (const hazard of eventHazards) {
      if (!hazard.incidentGroup) continue;
      const list = grouped.get(hazard.incidentGroup) ?? [];
      list.push(hazard);
      grouped.set(hazard.incidentGroup, list);
    }

    const events: MajorHistoricalEventSummary[] = [];
    for (const [incidentGroup, items] of grouped.entries()) {
      const startTimestamps = items.map((i) => Date.parse(i.reportedAt));
      const endTimestamps = items.map((i) =>
        i.resolvedAt ? Date.parse(i.resolvedAt) : Date.parse(i.reportedAt),
      );
      const minStart = Math.min(...startTimestamps);
      const maxEnd = Math.max(...endTimestamps);
      const peakSeverity = items.reduce<HazardSeverity>(
        (best, item) =>
          SEVERITY_RANK[item.severity] > SEVERITY_RANK[best]
            ? item.severity
            : best,
        'Advisory',
      );
      const cities = [
        ...new Set(
          items
            .map((i) => i.city)
            .filter((c): c is string => Boolean(c && c.trim())),
        ),
      ];
      const sources = [
        ...new Set(
          items
            .map((i) => i.sourceName)
            .filter((s): s is string => Boolean(s && s.trim())),
        ),
      ];

      events.push({
        incidentGroup,
        title: incidentGroup,
        startDate: toManilaDateKey(new Date(minStart)),
        endDate: toManilaDateKey(new Date(maxEnd)),
        hazardCount: items.length,
        cities,
        peakSeverity,
        sources,
        bounds: computeSpatialBounds(items),
      });
    }

    events.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return {
      liveCount,
      days,
      events,
      updatedAt: new Date().toISOString(),
    };
  }

  async geocode(query: string) {
    const key = query.toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    return this.enqueueProviderRequest(() => this.fetchGeocode(query, key));
  }

  async suggest(query: string, kind: 'location' | 'institution') {
    const cacheKey = `${kind}:${query.toLocaleLowerCase()}`;
    const cached = this.suggestionCache.get(cacheKey);
    if (cached) return cached;

    return this.enqueueProviderRequest(async () => {
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({
        q: query,
        limit: '30',
        lang: 'en',
        bbox: '116.9,4.5,126.6,21.5',
      }).toString();

      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      } catch (error) {
        this.logger.error(
          `OpenStreetMap suggestions failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        throw new ServiceUnavailableException(
          'Location suggestions are temporarily unavailable.',
        );
      }

      if (!response.ok) {
        this.logger.error(
          `OpenStreetMap suggestions returned HTTP ${response.status}.`,
        );
        throw new ServiceUnavailableException(
          'Location suggestions are temporarily unavailable.',
        );
      }

      const result = (await response.json()) as { features?: PhotonFeature[] };
      const suggestions = (result.features ?? [])
        .map(({ geometry, properties }) => {
          const name = properties.name?.trim();
          const isPhilippines =
            properties.country?.toLocaleLowerCase() === 'philippines';
          const type = properties.type?.toLocaleLowerCase();
          const isLocation =
            properties.osm_key === 'place' ||
            [
              'city',
              'state',
              'district',
              'locality',
              'county',
              'suburb',
              'village',
              'town',
              'municipality',
            ].includes(type ?? '');
          const isInstitution =
            properties.osm_key === 'amenity' &&
            ['school', 'university', 'college'].includes(
              properties.osm_value?.toLocaleLowerCase() ?? '',
            );
          const city =
            properties.city ??
            properties.county ??
            properties.district ??
            properties.locality ??
            '';
          const province = properties.state ?? '';
          const barangay = properties.suburb ?? properties.district ?? '';
          const detail =
            [
              properties.locality,
              properties.suburb,
              properties.district,
              city,
              province,
            ].find(
              (part) =>
                part && part.toLocaleLowerCase() !== name?.toLocaleLowerCase(),
            ) ?? '';
          const address = [
            properties.housenumber,
            properties.street,
            name,
            properties.suburb,
            properties.district,
            city,
            province,
            properties.country,
          ]
            .filter((part, index, parts) => {
              if (!part) return false;
              return (
                parts.findIndex(
                  (candidate) =>
                    candidate?.toLocaleLowerCase() === part.toLocaleLowerCase(),
                ) === index
              );
            })
            .join(', ');

          return {
            name,
            detail,
            address,
            latitude: geometry.coordinates[1],
            longitude: geometry.coordinates[0],
            city,
            province,
            barangay,
            matches:
              isPhilippines &&
              (kind === 'location' ? isLocation : isInstitution),
          };
        })
        .filter((suggestion): suggestion is MapSuggestion & { matches: true } =>
          Boolean(
            suggestion.name &&
            suggestion.matches &&
            Number.isFinite(suggestion.latitude) &&
            Number.isFinite(suggestion.longitude),
          ),
        )
        .slice(0, 7)
        .map(
          ({
            name,
            detail,
            address,
            latitude,
            longitude,
            city,
            province,
            barangay,
          }) => ({
            name,
            detail,
            address,
            latitude,
            longitude,
            city,
            province,
            barangay,
          }),
        );

      this.suggestionCache.set(cacheKey, suggestions);
      return suggestions;
    });
  }

  private async enqueueProviderRequest<T>(
    request: () => Promise<T>,
  ): Promise<T> {
    const previousRequest = this.requestQueue;
    let releaseRequest!: () => void;
    this.requestQueue = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await previousRequest;

    try {
      const delay = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      this.lastRequestAt = Date.now();
      return await request();
    } finally {
      releaseRequest();
    }
  }

  private async fetchGeocode(query: string, key: string) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
    }).toString();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'W.A.T.C.H. weather-safety-app' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(
        `OpenStreetMap geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new ServiceUnavailableException(
        'Location search is temporarily unavailable.',
      );
    }

    if (!response.ok) {
      this.logger.error(`OpenStreetMap returned HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Location search is temporarily unavailable.',
      );
    }

    const results = (await response.json()) as GeocodeResult[];
    const first = results[0];
    if (!first) throw new NotFoundException('No matching location was found.');

    const result = {
      name: first.name,
      latitude: Number(first.latitude),
      longitude: Number(first.longitude),
      address: first.address,
    };
    this.cache.set(key, result);
    return result;
  }
}

function toManilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildManilaRecentDates(count: number, now = new Date()): string[] {
  const todayKey = toManilaDateKey(now);
  const baseMs = Date.parse(`${todayKey}T12:00:00+08:00`);
  const dates: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    dates.push(toManilaDateKey(new Date(baseMs - offset * 86_400_000)));
  }
  return dates;
}

function toLatLngPoint(raw: unknown): LatLngPoint | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = Number(raw[0]);
    const b = Number(raw[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) {
      return { latitude: a, longitude: b };
    }
    return { latitude: b, longitude: a };
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const latitude = Number(rec.latitude ?? rec.lat);
    const longitude = Number(rec.longitude ?? rec.lon ?? rec.lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }
  return null;
}

function normalizePolygonRings(raw: unknown): LatLngPoint[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (Array.isArray(first) && first.length > 0 && (Array.isArray(first[0]) || (typeof first[0] === 'object' && first[0] !== null))) {
    const rings = raw
      .map((ring) =>
        Array.isArray(ring)
          ? ring
            .map(toLatLngPoint)
            .filter((p): p is LatLngPoint => p !== null)
          : [],
      )
      .filter((ring) => ring.length >= 3);
    return rings.length > 0 ? rings : null;
  }
  const singleRing = raw
    .map(toLatLngPoint)
    .filter((p): p is LatLngPoint => p !== null);
  return singleRing.length >= 3 ? [singleRing] : null;
}

function normalizePathPoints(raw: unknown): LatLngPoint[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const points = raw
    .map(toLatLngPoint)
    .filter((p): p is LatLngPoint => p !== null);
  return points.length >= 2 ? points : null;
}

function normalizeSeverity(raw: unknown): HazardSeverity {
  if (
    raw === 'Advisory' ||
    raw === 'Warning' ||
    raw === 'Severe' ||
    raw === 'Extreme'
  ) {
    return raw;
  }
  return 'Warning';
}

function normalizeSourceType(raw: unknown): HazardSourceType {
  if (
    raw === 'pagasa' ||
    raw === 'project_noah' ||
    raw === 'ndrrmc_ocd' ||
    raw === 'lgu_official' ||
    raw === 'weather_auto'
  ) {
    return raw;
  }
  return 'weather_auto';
}

function normalizeSafetyTips(
  raw: unknown,
): { do: string[]; prepare: string[]; avoid: string[] } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const items = raw.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    return items.length > 0 ? { do: items, prepare: [], avoid: [] } : null;
  }
  if (typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const toList = (val: unknown) =>
      Array.isArray(val)
        ? val.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
        : [];
    const doList = toList(rec.do);
    const prepareList = toList(rec.prepare);
    const avoidList = toList(rec.avoid);
    if (doList.length || prepareList.length || avoidList.length) {
      return { do: doList, prepare: prepareList, avoid: avoidList };
    }
  }
  return null;
}

function normalizeSpatialHazard(raw: unknown): SpatialHazardResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const category = row.map_category;
  if (
    category !== 'flood' &&
    category !== 'closure' &&
    category !== 'caution'
  ) {
    return null;
  }

  const latitude = Number(row.latitude ?? row.location_lat);
  const longitude = Number(row.longitude ?? row.location_lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const reportedAt =
    typeof row.started_at === 'string'
      ? row.started_at
      : typeof row.detected_at === 'string'
        ? row.detected_at
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString();
  const resolvedAt =
    typeof row.resolved_at === 'string' ? row.resolved_at : null;

  return {
    id: String(row.id),
    type: category,
    title:
      (typeof row.title === 'string' && row.title.trim()) ||
      (typeof row.hazard_type === 'string' && row.hazard_type.trim()) ||
      (typeof row.event_type === 'string' &&
        row.event_type.replace(/_/g, ' ')) ||
      'Spatial Hazard',
    description:
      (typeof row.description === 'string' && row.description.trim()) ||
      (typeof row.explanation === 'string' && row.explanation.trim()) ||
      '',
    severity: normalizeSeverity(row.severity ?? row.risk_level),
    eventType: typeof row.event_type === 'string' ? row.event_type : null,
    barangay: typeof row.barangay === 'string' ? row.barangay : null,
    city: typeof row.city === 'string' ? row.city : null,
    latitude,
    longitude,
    polygon: normalizePolygonRings(row.polygon),
    path: normalizePathPoints(row.path),
    radiusM:
      typeof row.radius_m === 'number' && Number.isFinite(row.radius_m)
        ? row.radius_m
        : null,
    sourceType: normalizeSourceType(row.source_type),
    sourceName:
      (typeof row.source_name === 'string' && row.source_name.trim()) ||
      'W.A.T.C.H. Weather Monitor',
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    incidentGroup:
      typeof row.incident_group === 'string' ? row.incident_group : null,
    reportedAt,
    resolvedAt,
    status: resolvedAt === null ? 'active' : 'resolved',
    safetyTips: normalizeSafetyTips(row.safety_tips),
  };
}

function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function isHazardWithinRadius(
  hazard: SpatialHazardResponse,
  lat: number,
  lon: number,
  radiusKm: number,
): boolean {
  if (distanceKm(lat, lon, hazard.latitude, hazard.longitude) <= radiusKm) {
    return true;
  }
  if (hazard.polygon) {
    for (const ring of hazard.polygon) {
      for (const pt of ring) {
        if (distanceKm(lat, lon, pt.latitude, pt.longitude) <= radiusKm) {
          return true;
        }
      }
    }
  }
  if (hazard.path) {
    for (const pt of hazard.path) {
      if (distanceKm(lat, lon, pt.latitude, pt.longitude) <= radiusKm) {
        return true;
      }
    }
  }
  return false;
}

function computeSpatialBounds(hazards: SpatialHazardResponse[]): HazardBounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  const expand = (lat: number, lon: number) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  };

  for (const h of hazards) {
    expand(h.latitude, h.longitude);
    if (h.polygon) {
      for (const ring of h.polygon) {
        for (const pt of ring) expand(pt.latitude, pt.longitude);
      }
    }
    if (h.path) {
      for (const pt of h.path) expand(pt.latitude, pt.longitude);
    }
  }

  const minPad = 0.008;
  if (maxLat - minLat < minPad) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - minPad / 2;
    maxLat = mid + minPad / 2;
  }
  if (maxLon - minLon < minPad) {
    const mid = (minLon + maxLon) / 2;
    minLon = mid - minPad / 2;
    maxLon = mid + minPad / 2;
  }

  return { minLat, maxLat, minLon, maxLon };
}
