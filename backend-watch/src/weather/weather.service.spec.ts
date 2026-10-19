import { describe, expect, it } from '@jest/globals';
import { classifyWeatherRisk } from './weather-risk';

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
});
