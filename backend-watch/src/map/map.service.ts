import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
}

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private readonly cache = new Map<string, GeocodeResult>();
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  async geocode(query: string) {
    const key = query.toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    const previousRequest = this.requestQueue;
    let releaseRequest!: () => void;
    this.requestQueue = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await previousRequest;

    try {
      return await this.fetchGeocode(query, key);
    } finally {
      releaseRequest();
    }
  }

  private async fetchGeocode(query: string, key: string) {
    const delay = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    this.lastRequestAt = Date.now();

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
      throw new ServiceUnavailableException('Location search is temporarily unavailable.');
    }

    if (!response.ok) {
      this.logger.error(`OpenStreetMap returned HTTP ${response.status}.`);
      throw new ServiceUnavailableException('Location search is temporarily unavailable.');
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
