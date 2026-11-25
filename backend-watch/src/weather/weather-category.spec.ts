import { describe, expect, it } from '@jest/globals';
import { classifyWeatherAnnouncement } from './weather-category';

describe('classifyWeatherAnnouncement', () => {
  it('maps supported weather hazards to their dedicated categories', () => {
    expect(
      classifyWeatherAnnouncement({
        eventType: 'EXTREME_HEAT_INDEX',
        hazardType: 'Extreme heat',
        category: null,
        sourceType: 'weather_auto',
      })?.category,
    ).toBe('Extreme Heat');
    expect(
      classifyWeatherAnnouncement({
        eventType: 'UNHEALTHY_AIR_QUALITY',
        hazardType: 'Unhealthy air quality',
        category: null,
        sourceType: 'weather_auto',
      })?.category,
    ).toBe('Unhealthy Air');
    expect(
      classifyWeatherAnnouncement({
        eventType: 'FLASH_FLOOD_RISK',
        hazardType: 'Flooding risk',
        category: null,
        sourceType: 'weather_auto',
      })?.category,
    ).toBe('Heavy Rain/Flood');
    expect(
      classifyWeatherAnnouncement({
        eventType: 'TYPHOON_WIND',
        hazardType: 'Typhoon conditions',
        category: null,
        sourceType: 'weather_auto',
      })?.category,
    ).toBe('PAGASA/Weather');
  });

  it('does not classify unrelated incidents as PAGASA weather', () => {
    expect(
      classifyWeatherAnnouncement({
        eventType: 'ROAD_CLOSURE',
        hazardType: 'Road closure',
        category: 'Closure',
        sourceType: 'lgu_official',
      }),
    ).toBeNull();
  });
});
