import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

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
