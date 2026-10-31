import { describe, expect, it } from '@jest/globals';
import { classifyWeatherRisk, detectWeatherHazards } from './weather-risk';

describe('classifyWeatherRisk', () => {
  it('keeps values below configured thresholds at Normal', () => {
    expect(classifyWeatherRisk(14.9, 38.9, 41.9, undefined, 100).level).toBe(
      'Normal',
    );
  });

  const thresholds: [number, number, number, number | undefined, string][] = [
    [15, 0, 0, undefined, 'Warning'],
    [30, 0, 0, undefined, 'Severe'],
    [0, 39, 0, undefined, 'Advisory'],
    [0, 62, 0, undefined, 'Warning'],
    [0, 88, 0, undefined, 'Severe'],
    [0, 0, 42, undefined, 'Warning'],
    [0, 0, 52, undefined, 'Severe'],
    [0, 0, 0, 101, 'Advisory'],
    [0, 0, 0, 151, 'Warning'],
    [0, 0, 0, 201, 'Severe'],
  ];

  it.each(thresholds)(
    'classifies configured thresholds (%s, %s, %s, %s)',
    (rain, wind, heat, aqi, expected) => {
      expect(classifyWeatherRisk(rain, wind, heat, undefined, aqi).level).toBe(
        expected,
      );
    },
  );

  it('detects rain, wind, heat, air quality, and thunder hazards at configured thresholds', () => {
    expect(detectWeatherHazards(15, 39, 42, 95, undefined, 101)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Strong winds',
          riskLevel: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Heavy rainfall',
          riskLevel: 'Warning',
        }),
        expect.objectContaining({
          type: 'Extreme heat',
          riskLevel: 'Warning',
        }),
        expect.objectContaining({
          type: 'Unhealthy air quality',
          riskLevel: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Thunderstorms',
          riskLevel: 'Warning',
        }),
      ]),
    );
    expect(detectWeatherHazards(0, 118, 0, 0)).toContainEqual({
      type: 'Typhoon / tropical cyclone conditions',
      riskLevel: 'Severe',
    });
    expect(detectWeatherHazards(0, 62, 0, 0, 980)).toContainEqual({
      type: 'Typhoon / tropical cyclone conditions',
      riskLevel: 'Severe',
    });
  });
});
