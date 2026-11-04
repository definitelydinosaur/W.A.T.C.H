import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MapService } from './map.service';

describe('MapService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns coordinates and address parts for location suggestions', async () => {
    const response = {
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [123.8857, 10.3158] },
              properties: {
                name: 'Cebu City',
                country: 'Philippines',
                state: 'Cebu',
                city: 'Cebu City',
                suburb: 'Lahug',
                type: 'city',
                osm_key: 'place',
              },
            },
          ],
        }),
    } as Response;
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    const service = new MapService();
    const suggestions = await service.suggest('Cebu City', 'location');

    expect(suggestions).toEqual([
      {
        name: 'Cebu City',
        detail: 'Lahug',
        address: 'Cebu City, Lahug, Cebu, Philippines',
        latitude: 10.3158,
        longitude: 123.8857,
        city: 'Cebu City',
        province: 'Cebu',
        barangay: 'Lahug',
      },
    ]);
  });
});
