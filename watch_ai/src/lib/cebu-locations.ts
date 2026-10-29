// Locations covered by the weather screen: every city, municipality and barangay
// in Cebu Province. The data lives in cebu-locations.data.ts (generated).
import { LOCATION_ROWS } from './cebu-locations.data';

export interface WeatherLocation {
  name: string;
  /** Label shown under the name in the location picker. */
  area: string;
  latitude: number;
  longitude: number;
  /** False when the barangay could not be located individually (parent centre used). */
  exact: boolean;
}

export const CEBU_LOCATIONS: WeatherLocation[] = LOCATION_ROWS.map(
  ([kind, name, parent, latitude, longitude, exact]) => ({
    name,
    area:
      kind === 'c'
        ? 'City · Cebu'
        : kind === 't'
          ? 'Municipality · Cebu'
          : `Barangay · ${parent}${exact ? '' : ' (approx.)'}`,
    latitude,
    longitude,
    exact: exact === 1,
  }),
);
