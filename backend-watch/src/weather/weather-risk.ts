export const WEATHER_THRESHOLDS = {
  rainMm: { advisory: 15, warning: 30, severe: 50 },
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
  heatIndexC: { advisory: 33, warning: 42, severe: 52 },
  typhoonPressureMslHpa: 980,
} as const;

export interface WeatherApiAlert {
  event: string;
  severity?: 'Advisory' | 'Warning' | 'Severe' | 'Extreme' | string;
  description?: string;
  headline?: string;
}

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
  eventType:
    | 'TYPHOON_WIND'
    | 'GALE_WIND'
    | 'FLASH_FLOOD_RISK'
    | 'EXTREME_RAINFALL'
    | 'EXTREME_HEAT_INDEX'
    | 'SEVERE_STORM_LIGHTNING'
    | 'API_WEATHER_ALERT';
  riskLevel: 'Advisory' | 'Warning' | 'Severe';
  severity: 'Advisory' | 'Warning' | 'Severe' | 'Extreme';
  description: string;
}

export function detectWeatherHazards(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
  weatherCode: number,
  pressureMslHpa?: number,
  windGustsKph = 0,
  apiAlerts: WeatherApiAlert[] = [],
): DetectedWeatherHazard[] {
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

  if (rainMm >= WEATHER_THRESHOLDS.rainMm.advisory) {
    const isFlashFlood = rainMm >= WEATHER_THRESHOLDS.rainMm.warning;
    const riskLevel =
      rainMm >= WEATHER_THRESHOLDS.rainMm.severe
        ? 'Severe'
        : isFlashFlood
          ? 'Warning'
          : 'Advisory';
    hazards.push({
      type: isFlashFlood ? 'Flooding risk' : 'Heavy rainfall',
      eventType: isFlashFlood ? 'FLASH_FLOOD_RISK' : 'EXTREME_RAINFALL',
      riskLevel,
      severity:
        rainMm >= WEATHER_THRESHOLDS.rainMm.severe ? 'Severe' : riskLevel,
      description: `Precipitation of ${rainMm.toFixed(1)} mm/hr breached the ${isFlashFlood ? 'flash flood warning' : 'heavy rainfall'} threshold.`,
    });
  }

  if (heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.advisory) {
    const riskLevel =
      heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe
        ? 'Severe'
        : heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.warning
          ? 'Warning'
          : 'Advisory';
    hazards.push({
      type: 'Extreme heat',
      eventType: 'EXTREME_HEAT_INDEX',
      riskLevel,
      severity:
        heatIndexC >= WEATHER_THRESHOLDS.heatIndexC.severe
          ? 'Extreme'
          : riskLevel,
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

  return hazards;
}
