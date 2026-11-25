import { describe, expect, it } from '@jest/globals';
import {
  HAZARD_TEMPLATE_VERSION,
  hazardTemplateKey,
  renderHazardTemplate,
} from './hazard-templates';

describe('fixed hazard templates', () => {
  it('uses the hazard type, measured value, area, observation time, and source', () => {
    const result = renderHazardTemplate({
      key: hazardTemplateKey('EXTREME_HEAT_INDEX', 'Extreme heat'),
      hazardType: 'Extreme heat',
      severity: 'Severe',
      place: 'Cebu City',
      observedAt: '2026-11-22T09:00:00.000Z',
      sourceName: 'Open-Meteo weather data',
      measurements: { heatIndexC: 52, rainMm: null, aqi: null },
    });

    expect(result.title).toBe('Extreme Heat Severe in Cebu City');
    expect(result.summary).toContain('52.0°C');
    expect(result.summary).toContain('Cebu City');
    expect(result.summary).toContain('2026-11-22T09:00:00.000Z');
    expect(result.summary).toContain('Open-Meteo weather data');
    expect(result.safetyTips.version).toBe(HAZARD_TEMPLATE_VERSION);
    expect(result.safetyTips.do_list.length).toBeGreaterThan(0);
    expect(result.safetyTips.dont_list.length).toBeGreaterThan(0);
    expect(result.safetyTips.emergency_note).toBeTruthy();
  });

  it('maps all requested hazard categories to fixed templates', () => {
    expect(hazardTemplateKey(null, 'Heat index')).toBe('extreme_heat');
    expect(hazardTemplateKey(null, 'Unhealthy air quality')).toBe(
      'unhealthy_air',
    );
    expect(hazardTemplateKey(null, 'Flooding risk')).toBe('heavy_rain_flood');
    expect(hazardTemplateKey(null, 'PAGASA weather alert')).toBe(
      'pagasa_weather',
    );
  });
});
