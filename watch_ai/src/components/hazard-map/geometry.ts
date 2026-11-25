import {
  HAZARD_META,
  type CoordInput,
  type Hazard,
  type HazardBounds,
  type LatLngPoint,
} from './types';

const EARTH_M = 6_371_000;
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/**
 * Normalizes a coordinate (`[lon, lat]`, `[lat, lon]`, or `{ latitude, longitude }`)
 * to GeoJSON `[longitude, latitude]` order.
 */
export function toLngLat(coord: CoordInput): [number, number] {
  if (Array.isArray(coord)) {
    const [a, b] = coord;
    return Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b];
  }
  return [coord.longitude, coord.latitude];
}

/** Normalizes a coordinate to `{ latitude, longitude }` for `react-native-maps`. */
export function toLatLngObject(coord: CoordInput): LatLngPoint {
  const [longitude, latitude] = toLngLat(coord);
  return { latitude, longitude };
}

/** Ensures a polygon ring is in `[longitude, latitude]` order and closed. */
export function closeRing(coords: CoordInput[]): [number, number][] {
  const ring = coords.map(toLngLat);
  if (ring.length === 0) return ring;
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  if (firstLon !== lastLon || firstLat !== lastLat) {
    ring.push([firstLon, firstLat]);
  }
  return ring;
}

/**
 * Normalizes single-ring or multi-ring polygon inputs into an array of closed
 * GeoJSON `[longitude, latitude][]` rings.
 */
export function toPolygonRings(
  polygon: Hazard['polygon'],
): [number, number][][] {
  if (!Array.isArray(polygon) || polygon.length === 0) return [];
  const first = polygon[0];
  if (Array.isArray(first)) {
    const innerFirst = first[0];
    if (
      Array.isArray(innerFirst) ||
      (typeof innerFirst === 'object' && innerFirst !== null)
    ) {
      return (polygon as CoordInput[][])
        .map((ring) => closeRing(ring))
        .filter((ring) => ring.length >= 4);
    }
  }
  const single = closeRing(polygon as CoordInput[]);
  return single.length >= 4 ? [single] : [];
}

/** Point at `distanceM` from (lat, lon) along `bearingDeg`. */
export function offsetPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const d = distanceM / EARTH_M;
  const b = toRad(bearingDeg);
  const la1 = toRad(lat);
  const lo1 = toRad(lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b),
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2),
    );
  return [toDeg(la2), toDeg(lo2)];
}

/** Fallback 2-point street segment centered on (lat, lon) when no `path` is provided. */
export function segmentAround(
  lat: number,
  lon: number,
  bearingDeg: number,
  lengthM: number,
): [number, number][] {
  const [lat1, lon1] = offsetPoint(lat, lon, bearingDeg + 180, lengthM / 2);
  const [lat2, lon2] = offsetPoint(lat, lon, bearingDeg, lengthM / 2);
  return [
    [lon1, lat1],
    [lon2, lat2],
  ];
}

export function defaultRadiusM(h: Hazard): number {
  if (h.radiusM) return h.radiusM;
  if (h.type === 'flood') {
    const sev = h.severity.toLowerCase();
    return sev === 'extreme' || sev === 'impassable'
      ? 450
      : sev === 'severe' || sev === 'knee-deep'
        ? 300
        : 180;
  }
  return 150;
}

export interface HazardShape {
  hazard: Hazard;
  color: string;
  /** Closed polygon rings as `[longitude, latitude][][]` (GeoJSON order), for areas. */
  rings: [number, number][][];
  /** Primary ring alias (`rings[0]`) for single-ring consumers. */
  ring?: [number, number][];
  /** Multi-point street geometry as `[longitude, latitude][]` (GeoJSON order). */
  line?: [number, number][];
}

function circleRing(lat: number, lon: number, radiusM: number): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const [la, lo] = offsetPoint(lat, lon, (i / 48) * 360, radiusM);
    ring.push([lo, la]);
  }
  return ring;
}

/**
 * Computes the area polygon rings (`rings`) and/or street polyline (`line`) of a hazard.
 */
export function hazardShape(h: Hazard): HazardShape {
  const color = HAZARD_META[h.type].color;
  const parsedRings = toPolygonRings(h.polygon);
  const hasPath = Boolean(h.path && h.path.length >= 2);

  const rings: [number, number][][] =
    parsedRings.length > 0
      ? parsedRings
      : h.type !== 'closure' && !hasPath
        ? [circleRing(h.latitude, h.longitude, defaultRadiusM(h))]
        : [];

  const line = hasPath
    ? h.path!.map(toLngLat)
    : h.type === 'closure'
      ? segmentAround(h.latitude, h.longitude, 90, 400)
      : undefined;

  return { hazard: h, color, rings, ring: rings[0], line };
}

/** Computes a padded geographic bounding box covering all vertices across a list of hazards. */
export function computeHazardsBounds(hazards: Hazard[]): HazardBounds | null {
  if (hazards.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  const expand = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  };

  for (const h of hazards) {
    expand(h.latitude, h.longitude);
    const shape = hazardShape(h);
    for (const ring of shape.rings) {
      for (const [lon, lat] of ring) expand(lat, lon);
    }
    if (shape.line) {
      for (const [lon, lat] of shape.line) expand(lat, lon);
    }
  }

  if (!Number.isFinite(minLat)) return null;

  const minSpan = 0.008;
  if (maxLat - minLat < minSpan) {
    const midLat = (minLat + maxLat) / 2;
    minLat = midLat - minSpan / 2;
    maxLat = midLat + minSpan / 2;
  }
  if (maxLon - minLon < minSpan) {
    const midLon = (minLon + maxLon) / 2;
    minLon = midLon - minSpan / 2;
    maxLon = midLon + minSpan / 2;
  }

  return { minLat, maxLat, minLon, maxLon };
}

export interface SnapRoadOptions {
  /** OSRM service mode: `'route'` connects waypoints along roads; `'match'` map-matches GPS traces. */
  mode?: 'route' | 'match';
  /** Custom OSRM server base URL. Defaults to `https://router.project-osrm.org`. */
  baseUrl?: string;
  signal?: AbortSignal;
}

interface OsrmGeometryResponse {
  routes?: { geometry?: { coordinates?: [number, number][] } }[];
  matchings?: { geometry?: { coordinates?: [number, number][] } }[];
}

/**
 * Optional online helper that snaps a list of waypoints to actual road geometry
 * using the public OSRM `route` or `match` endpoint (`geometries=geojson&overview=full`).
 * Returns GeoJSON `[longitude, latitude][]` coordinates, falling back to input points if offline.
 */
export async function snapPathToRoad(
  waypoints: CoordInput[],
  options: SnapRoadOptions = {},
): Promise<[number, number][]> {
  const normalized = waypoints.map(toLngLat);
  if (normalized.length < 2) return normalized;

  const mode = options.mode ?? 'route';
  const baseUrl = (options.baseUrl ?? DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');
  const coordsParam = normalized.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const url = `${baseUrl}/${mode}/v1/driving/${coordsParam}?geometries=geojson&overview=full`;

  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) return normalized;
    const data = (await response.json()) as OsrmGeometryResponse;
    if (mode === 'match') {
      const matched =
        data.matchings?.flatMap((m) => m.geometry?.coordinates ?? []) ?? [];
      return matched.length >= 2 ? matched : normalized;
    }
    const routed = data.routes?.[0]?.geometry?.coordinates;
    return routed && routed.length >= 2 ? routed : normalized;
  } catch {
    return normalized;
  }
}

/** Snaps a hazard's `path` to road geometry via OSRM, returning a new `Hazard` object. */
export async function snapHazardToRoad(
  hazard: Hazard,
  options?: SnapRoadOptions,
): Promise<Hazard> {
  if (!hazard.path || hazard.path.length < 2) return hazard;
  const snapped = await snapPathToRoad(hazard.path, options);
  return { ...hazard, path: snapped };
}
