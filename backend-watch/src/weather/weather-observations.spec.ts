import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES,
  getSustainedWeatherStart,
  getWeatherAlertSustainedMinutes,
  MAX_WEATHER_ALERT_SUSTAINED_MINUTES,
  MIN_WEATHER_ALERT_SUSTAINED_MINUTES,
  StoredWeatherRecord,
} from './weather-observations';

function record(minutesAgo: number, rainfall = 20): StoredWeatherRecord {
  return {
    recorded_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    temperature: 30,
    rainfall,
    wind_speed: 0,
    weather_condition: null,
    humidity: 50,
    heat_index: 35,
    uv_index: 0,
    aqi: 50,
    is_stale: false,
  };
}

describe('weather alert duration preferences', () => {
  it('uses 60 minutes by default and rejects values outside the supported range', () => {
    expect(getWeatherAlertSustainedMinutes(null)).toBe(
      DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES,
    );
    expect(
      getWeatherAlertSustainedMinutes({
        weather_sustained_minutes: MIN_WEATHER_ALERT_SUSTAINED_MINUTES - 1,
      }),
    ).toBe(DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES);
    expect(
      getWeatherAlertSustainedMinutes({
        weather_sustained_minutes: MAX_WEATHER_ALERT_SUSTAINED_MINUTES + 1,
      }),
    ).toBe(DEFAULT_WEATHER_ALERT_SUSTAINED_MINUTES);
    expect(
      getWeatherAlertSustainedMinutes({ weather_sustained_minutes: 30 }),
    ).toBe(30);
  });

  it('measures the current uninterrupted run and rejects stale or old readings', () => {
    const now = Date.now();
    const observations = [record(0), record(10), record(20, 0), record(30)];
    const since = getSustainedWeatherStart(
      observations,
      (observation) => observation.rainfall >= 15,
      now,
    );
    expect(since).toBe(observations[1].recorded_at);
    expect(
      getSustainedWeatherStart(
        [{ ...record(25), is_stale: true }],
        () => true,
        now,
      ),
    ).toBeNull();
    expect(getSustainedWeatherStart([record(25)], () => true, now)).toBeNull();
  });
});
