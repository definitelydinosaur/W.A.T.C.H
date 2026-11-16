import { describe, expect, it } from '@jest/globals';
import { parseWeatherSafetyTips } from './weather-safety-tips';

const validResponse = {
  summary:
    'Extreme heat is a serious risk. Follow official PAGASA/LGU advisories.',
  do: [
    'Drink water regularly throughout the day.',
    'Rest in a shaded or cool area.',
    'Check on vulnerable neighbors.',
  ],
  prepare: [
    'Keep water and medicines nearby.',
    'Charge phones and power banks.',
    'Arrange check-ins with family.',
  ],
  avoid: [
    'Avoid strenuous activity during peak heat.',
    'Never leave anyone in a parked vehicle.',
    'Avoid prolonged direct sun.',
  ],
};

describe('parseWeatherSafetyTips', () => {
  it('accepts a complete, grouped JSON safety response', () => {
    expect(parseWeatherSafetyTips(JSON.stringify(validResponse))).toEqual(
      validResponse,
    );
  });

  it('rejects malformed or incomplete JSON without throwing an unhandled parser error', () => {
    expect(() => parseWeatherSafetyTips('{bad')).toThrow('malformed');
    expect(() =>
      parseWeatherSafetyTips(
        JSON.stringify({ ...validResponse, avoid: ['Only one item.'] }),
      ),
    ).toThrow('required schema');
  });
});
