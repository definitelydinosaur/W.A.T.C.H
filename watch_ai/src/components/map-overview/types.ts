export type HazardSeverity = 'Advisory' | 'Warning' | 'Severe' | 'Extreme';

export type MapStyleKey = 'streets' | 'dark' | 'satellite' | 'hybrid';

export interface MapHazard {
  id: string;
  eventType: string;
  severity: HazardSeverity;
  description: string;
  latitude: number;
  longitude: number;
  detectedAt: string;
}

/** Incrementing `token` re-triggers the camera fly-to even for identical coordinates. */
export interface MapFocus {
  latitude: number;
  longitude: number;
  token: number;
  /** Approximate visible span in degrees (smaller = closer zoom). */
  span?: number;
}

export interface MapViewProps {
  latitude: number;
  longitude: number;
  label: string;
  mapStyle?: MapStyleKey;
  focus?: MapFocus;
  hazards?: MapHazard[];
  showHazards?: boolean;
  onHazardPress?: (id: string) => void;
}

export const SEVERITY_COLOR: Record<HazardSeverity, string> = {
  Advisory: '#F2C94C',
  Warning: '#F2994A',
  Severe: '#EB5757',
  Extreme: '#B3173A',
};

export const SEVERITY_RANK: Record<HazardSeverity, number> = {
  Advisory: 1,
  Warning: 2,
  Severe: 3,
  Extreme: 4,
};

/** Warning radius used for the hazard overlay circle, in meters. */
export const SEVERITY_RADIUS_M: Record<HazardSeverity, number> = {
  Advisory: 1200,
  Warning: 2200,
  Severe: 3500,
  Extreme: 5500,
};

