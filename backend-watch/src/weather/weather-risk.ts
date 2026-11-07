// Review with PAGASA before deployment: rain 15/30 mm per hour represents orange/red,
// heat index 42/52 C represents danger/extreme danger, and AQI uses US AQI bands.
export const WEATHER_THRESHOLDS = {
  rainMm: { warning: 15, severe: 30 },
  windKph: {
    advisory: 39,
    warning: 62,
    severe: 88,
    tropicalCyclone: 118,
  },
  windGustKph: {
    warning: 75,
    severe: 100,
    tropicalCyclone: 135,
  },
  heatIndexC: { warning: 42, severe: 52 },
  usAqi: { advisory: 101, warning: 151, severe: 201 },
  typhoonPressureMslHpa: 980,
} as const;

export type WeatherRiskLevel = 'Normal' | 'Advisory' | 'Warning' | 'Severe';

export interface WeatherApiAlert {
  event: string;
  severity?: 'Advisory' | 'Warning' | 'Severe' | 'Extreme' | string;
  description?: string;
  headline?: string;
}

export interface DetectedWeatherHazard {
  type: string;
  eventType:
    | 'TYPHOON_WIND'
    | 'GALE_WIND'
    | 'FLASH_FLOOD_RISK'
    | 'EXTREME_RAINFALL'
    | 'EXTREME_HEAT_INDEX'
    | 'SEVERE_STORM_LIGHTNING'
    | 'API_WEATHER_ALERT'
    | 'UNHEALTHY_AIR_QUALITY';
  riskLevel: Exclude<WeatherRiskLevel, 'Normal'>;
  severity: 'Advisory' | 'Warning' | 'Severe' | 'Extreme';
  description: string;
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
    0,
    [],
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
  windGustsKphOrAqi?: number | null,
  apiAlertsOrAqi?: WeatherApiAlert[] | number | null,
  aqi?: number | null,
): DetectedWeatherHazard[] {
  let windGustsKph = 0;
  let apiAlerts: WeatherApiAlert[] = [];
  let evaluatedAqi: number | null | undefined = undefined;

  if (Array.isArray(apiAlertsOrAqi)) {
    windGustsKph = typeof windGustsKphOrAqi === 'number' ? windGustsKphOrAqi : 0;
    apiAlerts = apiAlertsOrAqi;
    evaluatedAqi = aqi;
  } else if (typeof apiAlertsOrAqi === 'number' || apiAlertsOrAqi === null) {
    windGustsKph = typeof windGustsKphOrAqi === 'number' ? windGustsKphOrAqi : 0;
    evaluatedAqi = apiAlertsOrAqi;
  } else {
    // When called as detectWeatherHazards(rain, wind, heat, code, pressure, aqi)
    evaluatedAqi = windGustsKphOrAqi;
  }

  const hazards: DetectedWeatherHazard[] = [];
  const effectiveWind = Math.max(windKph, windGustsKph * 0.85);

  if (
    windKph >= WEATHER_THRESHOLDS.windKph.tropicalCyclone ||
    windGustsKph >= WEATHER_THRESHOLDS.windGustKph.tropicalCyclone ||
    (windKph >= WEATHER_THRESHOLDS.windKph.warning &&
      pressureMslHpa !== undefined &&
      pressureMslHpa <= WEATHER_THRESHOLDS.typhoonPressureMslHpa)
  ) {
    hazards.push({
      type: 'Typhoon / tropical cyclone conditions',
      eventType: 'TYPHOON_WIND',
      riskLevel: 'Severe',
      severity: 'Extreme',
      description: `Typhoon-force winds detected (sustained ${windKph.toFixed(1)} km/h${windGustsKph ? `, gusts ${windGustsKph.toFixed(1)} km/h` : ''}${pressureMslHpa ? `, pressure ${pressureMslHpa.toFixed(0)} hPa` : ''}).`,
    });
  } else if (
    windKph >= WEATHER_THRESHOLDS.windKph.advisory ||
    windGustsKph >= WEATHER_THRESHOLDS.windGustKph.warning
  ) {
    const isSevere =
      effectiveWind >= WEATHER_THRESHOLDS.windKph.severe ||
      windGustsKph >= WEATHER_THRESHOLDS.windGustKph.severe;
    const isWarning =
      effectiveWind >= WEATHER_THRESHOLDS.windKph.warning ||
      windGustsKph >= WEATHER_THRESHOLDS.windGustKph.warning;
    const riskLevel = isSevere ? 'Severe' : isWarning ? 'Warning' : 'Advisory';
    hazards.push({
      type: 'Strong winds',
      eventType: 'GALE_WIND',
      riskLevel,
      severity: riskLevel,
      description: `Gale/strong wind threshold breached (wind ${windKph.toFixed(1)} km/h${windGustsKph ? `, gusts ${windGustsKph.toFixed(1)} km/h` : ''}).`,
    });
  }

  if (rainMm >= WEATHER_THRESHOLDS.rainMm.warning) {
    const isSevere = rainMm >= WEATHER_THRESHOLDS.rainMm.severe;
    const riskLevel = isSevere ? 'Severe' : 'Warning';
    hazards.push({
      type: isSevere ? 'Flooding risk' : 'Heavy rainfall',
      eventType: isSevere ? 'FLASH_FLOOD_RISK' : 'EXTREME_RAINFALL',
      riskLevel,
      severity: riskLevel,
      description: `Precipitation of ${rainMm.toFixed(1)} mm/hr breached the ${isSevere ? 'flash flood warning' : 'heavy rainfall'} threshold.`,
    });
  }

  if (heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.warning) {
    const isSevere = heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe;
    const riskLevel = isSevere ? 'Severe' : 'Warning';
    hazards.push({
      type: 'Extreme heat',
      eventType: 'EXTREME_HEAT_INDEX',
      riskLevel,
      severity: isSevere ? 'Extreme' : 'Warning',
      description: `Heat index reached ${heatIndexC.toFixed(1)}°C (danger threshold >= 42°C).`,
    });
  }

  if ([95, 96, 99].includes(weatherCode)) {
    const isSevereHail = weatherCode === 96 || weatherCode === 99;
    hazards.push({
      type: 'Thunderstorms',
      eventType: 'SEVERE_STORM_LIGHTNING',
      riskLevel: isSevereHail ? 'Severe' : 'Warning',
      severity: isSevereHail ? 'Severe' : 'Warning',
      description: `Active thunderstorm and lightning alert reported (WMO weather code ${weatherCode}).`,
    });
  }

  for (const alert of apiAlerts) {
    if (!alert?.event) continue;
    const rawSeverity = (alert.severity ?? 'Warning').toLowerCase();
    const riskLevel: 'Advisory' | 'Warning' | 'Severe' =
      rawSeverity === 'extreme' || rawSeverity === 'severe'
        ? 'Severe'
        : rawSeverity === 'advisory'
          ? 'Advisory'
          : 'Warning';
    const severity: 'Advisory' | 'Warning' | 'Severe' | 'Extreme' =
      rawSeverity === 'extreme' ? 'Extreme' : riskLevel;
    hazards.push({
      type: alert.event,
      eventType: 'API_WEATHER_ALERT',
      riskLevel,
      severity,
      description:
        alert.description ||
        alert.headline ||
        `Active weather alert from provider: ${alert.event}`,
    });
  }

  if (
    evaluatedAqi !== undefined &&
    evaluatedAqi !== null &&
    evaluatedAqi >= WEATHER_THRESHOLDS.usAqi.advisory
  ) {
    const riskLevel: 'Advisory' | 'Warning' | 'Severe' =
      evaluatedAqi >= WEATHER_THRESHOLDS.usAqi.severe
        ? 'Severe'
        : evaluatedAqi >= WEATHER_THRESHOLDS.usAqi.warning
          ? 'Warning'
          : 'Advisory';
    hazards.push({
      type: 'Unhealthy air quality',
      eventType: 'UNHEALTHY_AIR_QUALITY',
      riskLevel,
      severity: riskLevel,
      description: `Air quality reached unhealthy level (US AQI ${evaluatedAqi}).`,
    });
  }

  return hazards;
}
