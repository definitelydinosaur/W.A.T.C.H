import { describe, expect, it } from '@jest/globals';
import {
  areasMatch,
  extractAreaMentions,
  normalizeAreaKey,
  normalizeAreaName,
} from './hazard-area';

describe('hazard area matching', () => {
  it('normalizes city names and groups by city and province', () => {
    expect(normalizeAreaName('City of Cebu City')).toBe('cebu');
    expect(
      normalizeAreaKey({
        city: 'Cebu City',
        province: 'Cebu Province',
        latitude: 10,
        longitude: 123,
      }),
    ).toBe('city:cebu|province:cebu');
  });

  it('matches exact city/province and falls back to nearby coordinates only when names are missing', () => {
    const cebu = {
      city: 'Cebu City',
      province: 'Cebu',
      latitude: 10.3157,
      longitude: 123.8854,
    };
    expect(
      areasMatch(cebu, {
        city: 'cebu',
        province: 'CEBU',
        latitude: 10.3,
        longitude: 123.9,
      }),
    ).toBe(true);
    expect(
      areasMatch(cebu, {
        city: 'Lapu-Lapu City',
        province: 'Cebu',
        latitude: 10.3,
        longitude: 123.9,
      }),
    ).toBe(false);
    expect(
      areasMatch(
        { city: null, province: null, latitude: 10.3157, longitude: 123.8854 },
        {
          city: 'Cebu City',
          province: 'Cebu',
          latitude: 10.3,
          longitude: 123.9,
        },
      ),
    ).toBe(true);
  });

  it('does not guess between duplicate city names when the source omits the province', () => {
    const locations = [
      {
        city: 'San Isidro',
        province: 'Davao del Norte',
        latitude: 7.5,
        longitude: 125.8,
      },
      {
        city: 'San Isidro',
        province: 'Leyte',
        latitude: 10.2,
        longitude: 124.8,
      },
    ];
    expect(extractAreaMentions('Alert for San Isidro.', locations)).toEqual([]);
    expect(
      extractAreaMentions('Alert for San Isidro, Leyte.', locations),
    ).toEqual([locations[1]]);
  });
});
