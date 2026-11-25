export type HazardType = 'flood' | 'closure' | 'caution';
export type HazardStatus = 'active' | 'resolved';
export type HazardSeverityLevel = 'Advisory' | 'Warning' | 'Severe' | 'Extreme';
export type HazardSourceType =
  | 'pagasa'
  | 'project_noah'
  | 'ndrrmc_ocd'
  | 'lgu_official'
  | 'weather_auto';

export type HazardViewMode = 'live' | 'date' | 'event';

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export type CoordInput = LatLngPoint | [number, number];

export interface HazardSafetyTips {
  do: string[];
  prepare: string[];
  avoid: string[];
}

export interface Hazard {
  id: string;
  type: HazardType;
  title: string;
  description: string;
  /** Severity band or detail label. */
  severity: string;
  eventType?: string | null;
  barangay?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  reportedAt: string; // ISO
  resolvedAt: string | null; // ISO
  status: HazardStatus;
  /** Area polygon rings (`LatLngPoint[][]`, `LatLngPoint[]`, or `[number, number][]`). */
  polygon?: LatLngPoint[][] | CoordInput[] | null;
  /** Fallback affected radius in meters when `polygon` and `path` are omitted. */
  radiusM?: number | null;
  /** Multi-waypoint road polyline coordinates. */
  path?: CoordInput[] | null;
  sourceType?: HazardSourceType;
  sourceName?: string;
  sourceUrl?: string | null;
  incidentGroup?: string | null;
  safetyTips?: HazardSafetyTips | null;
}

export interface HazardBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface HistoryDaySummary {
  date: string; // YYYY-MM-DD (Asia/Manila)
  count: number;
  peakSeverity: HazardSeverityLevel | null;
}

export interface MajorHistoricalEventSummary {
  incidentGroup: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hazardCount: number;
  cities: string[];
  peakSeverity: HazardSeverityLevel;
  sources: string[];
  bounds: HazardBounds;
}

export interface HazardHistoryIndex {
  liveCount: number;
  days: HistoryDaySummary[];
  events: MajorHistoricalEventSummary[];
  updatedAt: string;
}

export const HAZARD_META: Record<
  HazardType,
  { label: string; color: string; glyph: string }
> = {
  flood: { label: 'Flooded Area', color: '#2F80ED', glyph: '🌊' },
  closure: { label: 'Road / Area Closure', color: '#EB5757', glyph: '⛔' },
  caution: { label: 'Caution / Obstruction', color: '#F2C94C', glyph: '⚠️' },
};

export const HAZARD_TYPES: HazardType[] = ['flood', 'closure', 'caution'];

export const HAZARD_SEVERITY_COLOR: Record<HazardSeverityLevel, string> = {
  Advisory: '#F2C94C',
  Warning: '#F2994A',
  Severe: '#EB5757',
  Extreme: '#B3173A',
};

export const SOURCE_BADGE_META: Record<
  HazardSourceType,
  { shortLabel: string; bg: string; fg: string }
> = {
  pagasa: { shortLabel: 'PAGASA', bg: '#1D4ED8', fg: '#EFF6FF' },
  project_noah: { shortLabel: 'UP NOAH', bg: '#0F766E', fg: '#ECFEFF' },
  ndrrmc_ocd: { shortLabel: 'NDRRMC', bg: '#991B1B', fg: '#FEF2F2' },
  lgu_official: { shortLabel: 'LGU / DRRMO', bg: '#6D28D9', fg: '#F5F3FF' },
  weather_auto: { shortLabel: 'Weather Auto', bg: '#374151', fg: '#F3F4F6' },
};

export interface HazardFocus {
  latitude: number;
  longitude: number;
  zoom: number;
  /** Increment to re-trigger fly-to for identical coordinates. */
  token: number;
}

export interface HazardMapProps {
  hazards: Hazard[];
  /** True when viewing a past day or historical event: overlays render muted. */
  archived: boolean;
  selectedId: string | null;
  focus: HazardFocus | null;
  initialCenter: { latitude: number; longitude: number };
  onSelect: (id: string | null) => void;
}
