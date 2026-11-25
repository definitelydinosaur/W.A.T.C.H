import type { Hazard } from './types';

export type MapItem =
  | { kind: 'hazard'; hazard: Hazard }
  | {
      kind: 'cluster';
      key: string;
      latitude: number;
      longitude: number;
      hazards: Hazard[];
    };

/** Zoom at and above which markers are never clustered. */
export const CLUSTER_MAX_ZOOM = 16;

/** Simple grid clustering: one cluster per ~56px cell at the given zoom. */
export function clusterHazards(hazards: Hazard[], zoom: number): MapItem[] {
  if (zoom >= CLUSTER_MAX_ZOOM) {
    return hazards.map((hazard) => ({ kind: 'hazard', hazard }));
  }
  const cell = (360 / Math.pow(2, zoom)) * (56 / 256);
  const buckets = new Map<string, Hazard[]>();
  for (const h of hazards) {
    const key = `${Math.floor(h.latitude / cell)}:${Math.floor(h.longitude / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(h);
    else buckets.set(key, [h]);
  }
  const items: MapItem[] = [];
  buckets.forEach((list, key) => {
    if (list.length === 1) {
      items.push({ kind: 'hazard', hazard: list[0] });
      return;
    }
    items.push({
      kind: 'cluster',
      key: `${key}:${list.length}`,
      latitude: list.reduce((s, h) => s + h.latitude, 0) / list.length,
      longitude: list.reduce((s, h) => s + h.longitude, 0) / list.length,
      hazards: list,
    });
  });
  return items;
}

/** Approximate web-mercator zoom from a longitude span in degrees. */
export function zoomFromLongitudeDelta(delta: number): number {
  return Math.log2(360 / Math.max(delta, 1e-6));
}

