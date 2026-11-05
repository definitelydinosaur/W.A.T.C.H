import { describe, expect, it } from '@jest/globals';
import { classifyWeatherRisk, detectWeatherHazards } from './weather-risk';

describe('classifyWeatherRisk', () => {
  it('keeps values below configured thresholds at Normal', () => {
    expect(classifyWeatherRisk(14.9, 38.9, 32.9).level).toBe('Normal');
  });

  const thresholds: [number, number, number, string][] = [
    [15, 0, 0, 'Advisory'],
    [30, 0, 0, 'Warning'],
    [50, 0, 0, 'Severe'],
    [0, 39, 0, 'Advisory'],
    [0, 62, 0, 'Warning'],
    [0, 88, 0, 'Severe'],
    [0, 0, 33, 'Advisory'],
    [0, 0, 42, 'Warning'],
    [0, 0, 52, 'Severe'],
  ];

  it.each(thresholds)(
    'classifies configured thresholds (%s, %s, %s)',
    (rain, wind, heat, expected) => {
      expect(classifyWeatherRisk(rain, wind, heat).level).toBe(expected);
    },
  );

  it('detects storm, rain, wind, heat, and thunder hazards at advisory thresholds', () => {
    expect(detectWeatherHazards(15, 39, 33, 95)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Strong winds',
          eventType: 'GALE_WIND',
          riskLevel: 'Advisory',
          severity: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Heavy rainfall',
          eventType: 'EXTREME_RAINFALL',
          riskLevel: 'Advisory',
          severity: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Extreme heat',
          eventType: 'EXTREME_HEAT_INDEX',
          riskLevel: 'Advisory',
          severity: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Thunderstorms',
          eventType: 'SEVERE_STORM_LIGHTNING',
          riskLevel: 'Warning',
          severity: 'Warning',
        }),
      ]),
    );
    expect(detectWeatherHazards(0, 118, 0, 0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Typhoon / tropical cyclone conditions',
          eventType: 'TYPHOON_WIND',
          riskLevel: 'Severe',
          severity: 'Extreme',
        }),
      ]),
    );
    expect(detectWeatherHazards(0, 62, 0, 0, 980)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Typhoon / tropical cyclone conditions',
          eventType: 'TYPHOON_WIND',
          riskLevel: 'Severe',
          severity: 'Extreme',
        }),
      ]),
    );
  });

  it('detects gale/typhoon gusts and active provider weather alerts', () => {
    const hazards = detectWeatherHazards(0, 30, 42.5, 0, 1008, 85, [
      {
        event: 'Red Rainfall Warning',
        severity: 'Severe',
        description: 'Serious flooding expected in low-lying areas.',
      },
    ]);

    expect(hazards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'GALE_WIND',
          severity: 'Warning',
        }),
        expect.objectContaining({
          eventType: 'EXTREME_HEAT_INDEX',
          severity: 'Warning',
        }),
        expect.objectContaining({
          eventType: 'API_WEATHER_ALERT',
          type: 'Red Rainfall Warning',
          severity: 'Severe',
        }),
      ]),
    );
  });
});
