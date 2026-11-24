import { describe, expect, it } from '@jest/globals';
import {
  hasConsecutiveHazard,
  StoredWeatherRecord,
} from './weather-observations';

function reading(heatIndex: number, recordedAt: string): StoredWeatherRecord {
  return {
    recorded_at: recordedAt,
    temperature: heatIndex,
    rainfall: 0,
    wind_speed: 0,
    weather_condition: 'Clear',
    humidity: 50,
    heat_index: heatIndex,
    uv_index: 0,
    aqi: null,
    is_stale: false,
  };
}

describe('consecutive weather observations', () => {
  it('requires every configured fresh reading to cross the same hazard threshold', () => {
    const high = reading(52, '2026-11-22T09:10:00.000Z');
    const normal = reading(30, '2026-11-22T09:00:00.000Z');
    const stale = { ...high, is_stale: true };
    expect(
      hasConsecutiveHazard(
        'Extreme heat',
        [high, reading(52, '2026-11-22T09:00:00.000Z')],
        2,
      ),
    ).toBe(true);
    expect(hasConsecutiveHazard('Extreme heat', [high, normal], 2)).toBe(false);
    expect(hasConsecutiveHazard('Extreme heat', [high, stale], 2)).toBe(false);
    expect(hasConsecutiveHazard('Extreme heat', [high], 2)).toBe(false);
  });
});
