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
          riskLevel: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Heavy rainfall',
          riskLevel: 'Advisory',
        }),
        expect.objectContaining({
          type: 'Extreme heat',
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
