import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';
import { computeHazardsBounds } from './geometry';
import {
  buildRecentManilaDates,
  type DayOption,
  formatShortManilaDate,
  manilaDateKey,
} from './history';
import type {
  CoordInput,
  Hazard,
  HazardHistoryIndex,
  HazardSafetyTips,
  HazardSeverityLevel,
  HazardSourceType,
  HazardViewMode,
  HistoryDaySummary,
  LatLngPoint,
  MajorHistoricalEventSummary,
} from './types';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const INDEX_CACHE_KEY = 'watch.map-hazards.index.v1';
const QUERY_CACHE_PREFIX = 'watch.map-hazards.query.v1:';
const LIVE_REFRESH_MS = 60_000;

const SPATIAL_SELECT =
  'id,map_category,title,description,explanation,event_type,hazard_type,severity,risk_level,barangay,city,latitude,longitude,location_lat,location_lon,polygon,path,radius_m,source_type,source_name,source_url,incident_group,started_at,detected_at,created_at,resolved_at,safety_tips';

const SEVERITY_RANK: Record<HazardSeverityLevel, number> = {
  Advisory: 1,
  Warning: 2,
  Severe: 3,
  Extreme: 4,
};

interface HazardsApiResponse {
  mode: HazardViewMode;
  date: string | null;
  incidentGroup: string | null;
  hazards: Hazard[];
  updatedAt: string;
}

class SchemaNotMigratedError extends Error {
  constructor() {
    super('Apply spatial hazards migration in Supabase to enable flood/road layers.');
    this.name = 'SchemaNotMigratedError';
  }
}

function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    Boolean(err.message?.includes('map_category')) ||
    Boolean(err.message?.includes('incident_group'))
  );
}

function normalizeSeverity(raw: unknown): HazardSeverityLevel {
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

function normalizeTips(raw: unknown): HazardSafetyTips | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const items = raw.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return items.length ? { do: items, prepare: [], avoid: [] } : null;
  }
  if (typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const pick = (v: unknown) =>
      Array.isArray(v)
        ? v.filter(
            (x): x is string => typeof x === 'string' && x.trim().length > 0,
          )
        : [];
    const doList = pick(rec.do);
    const prepareList = pick(rec.prepare);
    const avoidList = pick(rec.avoid);
    if (doList.length || prepareList.length || avoidList.length) {
      return { do: doList, prepare: prepareList, avoid: avoidList };
    }
  }
  return null;
}

function normalizeSupabaseHazard(raw: unknown): Hazard | null {
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
    reportedAt,
    resolvedAt,
    status: resolvedAt === null ? 'active' : 'resolved',
    polygon: Array.isArray(row.polygon)
      ? (row.polygon as LatLngPoint[][] | CoordInput[])
      : null,
    path: Array.isArray(row.path) ? (row.path as CoordInput[]) : null,
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
    safetyTips: normalizeTips(row.safety_tips),
  };
}

async function fetchHazardsFromSupabase(
  mode: HazardViewMode,
  dateKey: string,
  eventGroup: string | null,
): Promise<Hazard[]> {
  let rawRows: unknown[] = [];

  if (mode === 'live') {
    const { data, error } = await supabase
      .from('hazards')
      .select(SPATIAL_SELECT)
      .not('map_category', 'is', null)
      .is('resolved_at', null)
      .order('started_at', { ascending: false })
      .limit(300);
    if (error) {
      if (isMissingSchemaError(error)) throw new SchemaNotMigratedError();
      throw new Error(error.message);
    }
    rawRows = Array.isArray(data) ? data : [];
  } else if (mode === 'event') {
    if (!eventGroup) return [];
    const { data, error } = await supabase
      .from('hazards')
      .select(SPATIAL_SELECT)
      .not('map_category', 'is', null)
      .eq('incident_group', eventGroup)
      .order('started_at', { ascending: false })
      .limit(300);
    if (error) {
      if (isMissingSchemaError(error)) throw new SchemaNotMigratedError();
      throw new Error(error.message);
    }
    rawRows = Array.isArray(data) ? data : [];
  } else {
    const pStart = `${dateKey}T00:00:00+08:00`;
    const pEnd = `${dateKey}T23:59:59.999+08:00`;
    const { data, error } = await supabase.rpc('get_map_hazards_by_range', {
      p_start: pStart,
      p_end: pEnd,
      p_include_active: true,
      p_city: null,
    });
    if (error) {
      if (isMissingSchemaError(error)) throw new SchemaNotMigratedError();
      if (
        error.code === 'PGRST202' ||
        error.message.includes('get_map_hazards_by_range')
      ) {
        const fb = await supabase
          .from('hazards')
          .select(SPATIAL_SELECT)
          .not('map_category', 'is', null)
          .lte('started_at', pEnd)
          .or(`resolved_at.is.null,resolved_at.gte.${pStart}`)
          .order('started_at', { ascending: false })
          .limit(300);
        if (fb.error) {
          if (isMissingSchemaError(fb.error)) throw new SchemaNotMigratedError();
          throw new Error(fb.error.message);
        }
        rawRows = Array.isArray(fb.data) ? fb.data : [];
      } else {
        throw new Error(error.message);
      }
    } else {
      rawRows = Array.isArray(data) ? data : [];
    }
  }

  return rawRows
    .map(normalizeSupabaseHazard)
    .filter((h): h is Hazard => h !== null)
    .sort(
      (a, b) =>
        SEVERITY_RANK[normalizeSeverity(b.severity)] -
          SEVERITY_RANK[normalizeSeverity(a.severity)] ||
        Date.parse(b.reportedAt) - Date.parse(a.reportedAt),
    );
}

async function fetchIndexFromSupabase(): Promise<HazardHistoryIndex> {
  const recentDates = buildRecentManilaDates(30);
  const oldestDate = recentDates[recentDates.length - 1];
  const windowStartIso = `${oldestDate}T00:00:00+08:00`;

  const [recentRes, eventsRes] = await Promise.all([
    supabase
      .from('hazards')
      .select(SPATIAL_SELECT)
      .not('map_category', 'is', null)
      .or(`resolved_at.is.null,resolved_at.gte.${windowStartIso}`)
      .limit(1000),
    supabase
      .from('hazards')
      .select(SPATIAL_SELECT)
      .not('map_category', 'is', null)
      .not('incident_group', 'is', null)
      .limit(1000),
  ]);

  if (recentRes.error) {
    if (isMissingSchemaError(recentRes.error)) throw new SchemaNotMigratedError();
    throw new Error(recentRes.error.message);
  }
  if (eventsRes.error) {
    if (isMissingSchemaError(eventsRes.error)) throw new SchemaNotMigratedError();
    throw new Error(eventsRes.error.message);
  }

  const recentHazards = (Array.isArray(recentRes.data) ? recentRes.data : [])
    .map(normalizeSupabaseHazard)
    .filter((h): h is Hazard => h !== null);

  const liveCount = recentHazards.filter((h) => h.status === 'active').length;

  const days: HistoryDaySummary[] = recentDates.map((date) => {
    const startMs = Date.parse(`${date}T00:00:00+08:00`);
    const endMs = Date.parse(`${date}T23:59:59.999+08:00`);
    const overlapping = recentHazards.filter((h) => {
      const s = Date.parse(h.reportedAt);
      const r = h.resolvedAt ? Date.parse(h.resolvedAt) : Infinity;
      return s <= endMs && r >= startMs;
    });
    const peakSeverity = overlapping.reduce<HazardSeverityLevel | null>(
      (best, item) => {
        const sev = normalizeSeverity(item.severity);
        return !best || SEVERITY_RANK[sev] > SEVERITY_RANK[best] ? sev : best;
      },
      null,
    );
    return { date, count: overlapping.length, peakSeverity };
  });

  const eventHazards = (Array.isArray(eventsRes.data) ? eventsRes.data : [])
    .map(normalizeSupabaseHazard)
    .filter((h): h is Hazard => h !== null);

  const grouped = new Map<string, Hazard[]>();
  for (const h of eventHazards) {
    if (!h.incidentGroup) continue;
    const list = grouped.get(h.incidentGroup) ?? [];
    list.push(h);
    grouped.set(h.incidentGroup, list);
  }

  const events: MajorHistoricalEventSummary[] = [];
  for (const [incidentGroup, items] of grouped.entries()) {
    const startTimestamps = items.map((i) => Date.parse(i.reportedAt));
    const endTimestamps = items.map((i) =>
      i.resolvedAt ? Date.parse(i.resolvedAt) : Date.parse(i.reportedAt),
    );
    const peakSeverity = items.reduce<HazardSeverityLevel>((best, item) => {
      const sev = normalizeSeverity(item.severity);
      return SEVERITY_RANK[sev] > SEVERITY_RANK[best] ? sev : best;
    }, 'Advisory');
    const bounds = computeHazardsBounds(items) ?? {
      minLat: 10.24,
      maxLat: 10.42,
      minLon: 123.82,
      maxLon: 123.98,
    };
    events.push({
      incidentGroup,
      title: incidentGroup,
      startDate: manilaDateKey(new Date(Math.min(...startTimestamps))),
      endDate: manilaDateKey(new Date(Math.max(...endTimestamps))),
      hazardCount: items.length,
      cities: [
        ...new Set(
          items
            .map((i) => i.city)
            .filter((c): c is string => Boolean(c && c.trim())),
        ),
      ],
      peakSeverity,
      sources: [
        ...new Set(
          items
            .map((i) => i.sourceName)
            .filter((s): s is string => Boolean(s && s.trim())),
        ),
      ],
      bounds,
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

const memoryIndexCache = { value: null as HazardHistoryIndex | null };
const memoryHazardsCache = new Map<string, Hazard[]>();

function buildQueryKey(
  mode: HazardViewMode,
  dateKey: string,
  eventGroup: string | null,
): string {
  if (mode === 'live') return 'live';
  if (mode === 'date') return `date:${dateKey}`;
  return `event:${eventGroup ?? ''}`;
}

export function useHazardHistory() {
  const [viewMode, setViewMode] = useState<HazardViewMode>('live');
  const [selectedDate, setSelectedDate] = useState<string>(() => manilaDateKey());
  const [selectedEventGroup, setSelectedEventGroup] = useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [visible, setVisible] = useState<Hazard[]>([]);
  const [historyIndex, setHistoryIndex] = useState<HazardHistoryIndex | null>(
    memoryIndexCache.value,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineCache, setIsOfflineCache] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const activeQueryKeyRef = useRef<string>('live');
  const apiNotFoundRef = useRef<boolean>(false);
  const missingSchemaRef = useRef<boolean>(false);

  const fetchIndex = useCallback(async (signal?: AbortSignal) => {
    if (missingSchemaRef.current) return;

    try {
      let data: HazardHistoryIndex;
      if (API_URL && !apiNotFoundRef.current) {
        const response = await fetch(`${API_URL}/map/hazards/history-index`, {
          signal,
        });
        if (response.status === 404) {
          apiNotFoundRef.current = true;
          data = await fetchIndexFromSupabase();
        } else if (!response.ok) {
          throw new Error(`History index returned HTTP ${response.status}`);
        } else {
          data = (await response.json()) as HazardHistoryIndex;
        }
      } else {
        data = await fetchIndexFromSupabase();
      }

      if (signal?.aborted) return;
      memoryIndexCache.value = data;
      setHistoryIndex(data);
      void AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(data)).catch(
        () => undefined,
      );
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof SchemaNotMigratedError) {
        missingSchemaRef.current = true;
        return;
      }
      const cached =
        memoryIndexCache.value ??
        (await AsyncStorage.getItem(INDEX_CACHE_KEY)
          .then((raw) => (raw ? (JSON.parse(raw) as HazardHistoryIndex) : null))
          .catch(() => null));
      if (cached) {
        memoryIndexCache.value = cached;
        setHistoryIndex(cached);
      } else {
        console.warn('Unable to load map hazard history index:', err);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchIndex(controller.signal);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchIndex, refreshTick]);

  useEffect(() => {
    const queryKey = buildQueryKey(viewMode, selectedDate, selectedEventGroup);
    activeQueryKeyRef.current = queryKey;
    const controller = new AbortController();

    const loadHazards = async () => {
      if (missingSchemaRef.current) {
        setVisible([]);
        setLoading(false);
        setError(
          'Apply spatial hazards migration in Supabase to enable flood/road layers.',
        );
        return;
      }

      const memCached = memoryHazardsCache.get(queryKey);
      if (memCached) {
        setVisible(memCached);
      }

      setLoading(!memCached);
      setError(null);

      try {
        let nextHazards: Hazard[];
        if (API_URL && !apiNotFoundRef.current) {
          const params = new URLSearchParams({ mode: viewMode });
          if (viewMode === 'date') {
            params.set('date', selectedDate);
          } else if (viewMode === 'event' && selectedEventGroup) {
            params.set('incidentGroup', selectedEventGroup);
          }
          const response = await fetch(`${API_URL}/map/hazards?${params}`, {
            signal: controller.signal,
          });
          if (response.status === 404) {
            apiNotFoundRef.current = true;
            nextHazards = await fetchHazardsFromSupabase(
              viewMode,
              selectedDate,
              selectedEventGroup,
            );
          } else if (!response.ok) {
            throw new Error(`Map hazards returned HTTP ${response.status}`);
          } else {
            const body = (await response.json()) as HazardsApiResponse;
            nextHazards = Array.isArray(body.hazards) ? body.hazards : [];
          }
        } else {
          nextHazards = await fetchHazardsFromSupabase(
            viewMode,
            selectedDate,
            selectedEventGroup,
          );
        }

        if (controller.signal.aborted || activeQueryKeyRef.current !== queryKey) {
          return;
        }
        memoryHazardsCache.set(queryKey, nextHazards);
        setVisible(nextHazards);
        setIsOfflineCache(false);
        setError(null);
        void AsyncStorage.setItem(
          `${QUERY_CACHE_PREFIX}${queryKey}`,
          JSON.stringify(nextHazards),
        ).catch(() => undefined);
      } catch (err) {
        if (controller.signal.aborted || activeQueryKeyRef.current !== queryKey) {
          return;
        }
        if (err instanceof SchemaNotMigratedError) {
          missingSchemaRef.current = true;
          setVisible([]);
          setIsOfflineCache(false);
          setError(err.message);
          return;
        }
        const stored =
          memCached ??
          (await AsyncStorage.getItem(`${QUERY_CACHE_PREFIX}${queryKey}`)
            .then((raw) => (raw ? (JSON.parse(raw) as Hazard[]) : null))
            .catch(() => null));
        if (stored) {
          memoryHazardsCache.set(queryKey, stored);
          setVisible(stored);
          setIsOfflineCache(true);
          setError('Showing cached hazard data (offline).');
        } else {
          setVisible([]);
          setIsOfflineCache(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load spatial hazards.',
          );
        }
      } finally {
        if (!controller.signal.aborted && activeQueryKeyRef.current === queryKey) {
          setLoading(false);
        }
      }
    };

    void loadHazards();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (viewMode === 'live') {
      interval = setInterval(() => {
        void loadHazards();
        void fetchIndex();
      }, LIVE_REFRESH_MS);
    }

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [fetchIndex, refreshTick, selectedDate, selectedEventGroup, viewMode]);

  const recentDays = useMemo<DayOption[]>(() => {
    const keys = buildRecentManilaDates(7);
    const byDate = new Map<string, HistoryDaySummary>(
      (historyIndex?.days ?? []).map((d) => [d.date, d]),
    );
    return keys.map((dateKey, offset) => {
      const shortDate = formatShortManilaDate(dateKey);
      const summary = byDate.get(dateKey);
      const count =
        offset === 0
          ? historyIndex?.liveCount ?? (viewMode === 'live' ? visible.length : 0)
          : summary?.count ?? 0;
      return {
        dateKey,
        offset,
        isLive: offset === 0,
        shortDate,
        label: offset === 0 ? `${shortDate} (Live)` : shortDate,
        count,
        peakSeverity: summary?.peakSeverity ?? null,
      };
    });
  }, [historyIndex, viewMode, visible.length]);

  const allHistoryDays = useMemo<HistoryDaySummary[]>(() => {
    if (historyIndex?.days?.length) return historyIndex.days;
    return buildRecentManilaDates(30).map((date) => ({
      date,
      count: 0,
      peakSeverity: null,
    }));
  }, [historyIndex]);

  const majorEvents = useMemo<MajorHistoricalEventSummary[]>(
    () => historyIndex?.events ?? [],
    [historyIndex],
  );

  const selectedEvent = useMemo(
    () =>
      selectedEventGroup
        ? majorEvents.find((e) => e.incidentGroup === selectedEventGroup) ?? null
        : null,
    [majorEvents, selectedEventGroup],
  );

  const selected = useMemo(
    () => visible.find((h) => h.id === selectedId) ?? null,
    [selectedId, visible],
  );

  const selectLive = useCallback(() => {
    setViewMode('live');
    setSelectedDate(manilaDateKey());
    setSelectedEventGroup(null);
    setSelectedId(null);
  }, []);

  const selectDate = useCallback((dateKey: string) => {
    const todayKey = manilaDateKey();
    if (dateKey === todayKey) {
      setViewMode('live');
      setSelectedDate(todayKey);
      setSelectedEventGroup(null);
      setSelectedId(null);
      return;
    }
    setViewMode('date');
    setSelectedDate(dateKey);
    setSelectedEventGroup(null);
    setSelectedId(null);
  }, []);

  const selectEvent = useCallback((incidentGroup: string) => {
    setViewMode('event');
    setSelectedEventGroup(incidentGroup);
    setSelectedId(null);
  }, []);

  const refresh = useCallback(() => {
    apiNotFoundRef.current = false;
    missingSchemaRef.current = false;
    setRefreshTick((t) => t + 1);
  }, []);

  const activeDayOption = useMemo<DayOption>(() => {
    if (viewMode === 'live') return recentDays[0];
    const match = recentDays.find((d) => d.dateKey === selectedDate);
    if (match) return match;
    const summary = allHistoryDays.find((d) => d.date === selectedDate);
    return {
      dateKey: selectedDate,
      offset: 7,
      isLive: false,
      shortDate: formatShortManilaDate(selectedDate),
      label: formatShortManilaDate(selectedDate),
      count: summary?.count ?? visible.length,
      peakSeverity: summary?.peakSeverity ?? null,
    };
  }, [allHistoryDays, recentDays, selectedDate, viewMode, visible.length]);

  return {
    viewMode,
    selectedDate,
    selectedEventGroup,
    selectedEvent,
    day: activeDayOption,
    recentDays,
    allHistoryDays,
    majorEvents,
    visible,
    selected,
    selectedId: selected?.id ?? null,
    loading,
    error,
    isOfflineCache,
    setSelectedId,
    selectLive,
    selectDate,
    selectEvent,
    refresh,
  };
}

export type HazardHistory = ReturnType<typeof useHazardHistory>;
