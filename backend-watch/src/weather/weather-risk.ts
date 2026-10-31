export const WEATHER_THRESHOLDS = {
  rainMm: { advisory: 15, warning: 30, severe: 50 },
  windKph: { advisory: 39, warning: 62, severe: 88, tropicalCyclone: 118 },
  heatIndexC: { advisory: 33, warning: 42, severe: 52 },
  typhoonPressureMslHpa: 980,
} as const;

export function classifyWeatherRisk(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
  weatherCode?: number,
) {
  if ([95, 96, 99].includes(weatherCode ?? -1)) {
    return {
      level: 'Warning',
      reason: 'Thunderstorm conditions were reported by the weather provider.',
    };
  }
  if (
    windKph >= WEATHER_THRESHOLDS.windKph.severe ||
    rainMm >= WEATHER_THRESHOLDS.rainMm.severe ||
    heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe
  ) {
    return {
      level: 'Severe',
      reason:
        'A measured weather value has reached the configured severe threshold.',
    };
  }
  if (
    windKph >= WEATHER_THRESHOLDS.windKph.warning ||
    rainMm >= WEATHER_THRESHOLDS.rainMm.warning ||
    heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.warning
  ) {
    return {
      level: 'Warning',
      reason: 'Weather conditions have crossed a configured warning threshold.',
    };
  }
  if (
    windKph >= WEATHER_THRESHOLDS.windKph.advisory ||
    rainMm >= WEATHER_THRESHOLDS.rainMm.advisory ||
    heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.advisory
  ) {
    return {
      level: 'Advisory',
      reason:
        'Weather conditions have crossed a configured advisory threshold.',
    };
  }
  return {
    level: 'Normal',
    reason: 'No configured threshold is currently exceeded.',
  };
}

export interface DetectedWeatherHazard {
  type: string;
  riskLevel: 'Advisory' | 'Warning' | 'Severe';
}

export function detectWeatherHazards(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
  weatherCode: number,
  pressureMslHpa?: number,
): DetectedWeatherHazard[] {
  const hazards: DetectedWeatherHazard[] = [];
  if (
    windKph >= WEATHER_THRESHOLDS.windKph.tropicalCyclone ||
    (windKph >= WEATHER_THRESHOLDS.windKph.warning &&
      pressureMslHpa !== undefined &&
      pressureMslHpa <= WEATHER_THRESHOLDS.typhoonPressureMslHpa)
  ) {
    hazards.push({
      type: 'Typhoon / tropical cyclone conditions',
      riskLevel: 'Severe',
    });
  } else if (windKph >= WEATHER_THRESHOLDS.windKph.advisory) {
    hazards.push({
      type: 'Strong winds',
      riskLevel:
        windKph >= WEATHER_THRESHOLDS.windKph.severe
          ? 'Severe'
          : windKph >= WEATHER_THRESHOLDS.windKph.warning
            ? 'Warning'
            : 'Advisory',
    });
  }
  if (rainMm >= WEATHER_THRESHOLDS.rainMm.advisory) {
    hazards.push({
      type:
        rainMm >= WEATHER_THRESHOLDS.rainMm.warning
          ? 'Flooding risk'
          : 'Heavy rainfall',
      riskLevel:
        rainMm >= WEATHER_THRESHOLDS.rainMm.severe
          ? 'Severe'
          : rainMm >= WEATHER_THRESHOLDS.rainMm.warning
            ? 'Warning'
            : 'Advisory',
    });
  }
  if (heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.advisory) {
    hazards.push({
      type: 'Extreme heat',
      riskLevel:
        heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe
          ? 'Severe'
          : heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.warning
            ? 'Warning'
            : 'Advisory',
    });
  }
  if ([95, 96, 99].includes(weatherCode)) {
    hazards.push({ type: 'Thunderstorms', riskLevel: 'Warning' });
  }
  return hazards;
}
