// Review with PAGASA before deployment: rain 15/30 mm per hour represents orange/red,
// heat index 42/52 C represents danger/extreme danger, and AQI uses US AQI bands.
export const WEATHER_THRESHOLDS = {
  rainMm: { warning: 15, severe: 30 },
  windKph: { advisory: 39, warning: 62, severe: 88, tropicalCyclone: 118 },
  heatIndexC: { warning: 42, severe: 52 },
  usAqi: { advisory: 101, warning: 151, severe: 201 },
  typhoonPressureMslHpa: 980,
} as const;

export type WeatherRiskLevel = 'Normal' | 'Advisory' | 'Warning' | 'Severe';

export interface DetectedWeatherHazard {
  type: string;
  riskLevel: Exclude<WeatherRiskLevel, 'Normal'>;
}

const RISK_RANK: Record<WeatherRiskLevel, number> = {
  Normal: 0,
  Advisory: 1,
  Warning: 2,
  Severe: 3,
};

function maxRisk(...levels: WeatherRiskLevel[]): WeatherRiskLevel {
  return levels.reduce(
    (highest, level) =>
      RISK_RANK[level] > RISK_RANK[highest] ? level : highest,
    'Normal',
  );
}

export function classifyWeatherRisk(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
  weatherCode?: number,
  aqi?: number | null,
): { level: WeatherRiskLevel; reason: string } {
  const hazards = detectWeatherHazards(
    rainMm,
    windKph,
    heatIndexC,
    weatherCode ?? -1,
    undefined,
    aqi,
  );
  const level = maxRisk(...hazards.map((hazard) => hazard.riskLevel));
  return {
    level,
    reason:
      level === 'Normal'
        ? 'No configured weather or air-quality threshold is currently exceeded.'
        : 'A measured weather or air-quality value crossed a configured rule threshold.',
  };
}

export function detectWeatherHazards(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
  weatherCode: number,
  pressureMslHpa?: number,
  aqi?: number | null,
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
  if (rainMm >= WEATHER_THRESHOLDS.rainMm.warning) {
    hazards.push({
      type:
        rainMm >= WEATHER_THRESHOLDS.rainMm.severe
          ? 'Flooding risk'
          : 'Heavy rainfall',
      riskLevel:
        rainMm >= WEATHER_THRESHOLDS.rainMm.severe ? 'Severe' : 'Warning',
    });
  }
  if (heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.warning) {
    hazards.push({
      type: 'Extreme heat',
      riskLevel:
        heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe
          ? 'Severe'
          : 'Warning',
    });
  }
  if ([95, 96, 99].includes(weatherCode)) {
    hazards.push({ type: 'Thunderstorms', riskLevel: 'Warning' });
  }
  if (
    aqi !== undefined &&
    aqi !== null &&
    aqi >= WEATHER_THRESHOLDS.usAqi.advisory
  ) {
    hazards.push({
      type: 'Unhealthy air quality',
      riskLevel:
        aqi >= WEATHER_THRESHOLDS.usAqi.severe
          ? 'Severe'
          : aqi >= WEATHER_THRESHOLDS.usAqi.warning
            ? 'Warning'
            : 'Advisory',
    });
  }
  return hazards;
}
