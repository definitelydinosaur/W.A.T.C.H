export const HAZARD_TEMPLATE_VERSION = 1;

export type HazardSeverity = 'Advisory' | 'Warning' | 'Severe' | 'Extreme';
export type HazardTemplateKey =
  'extreme_heat' | 'unhealthy_air' | 'heavy_rain_flood' | 'pagasa_weather';

type Guidance = {
  summaryPattern: string;
  do_list: string[];
  prepare_list: string[];
  dont_list: string[];
  emergency_note: string;
};

type HazardTemplate = {
  titlePattern: string;
  severity: Record<HazardSeverity, Guidance>;
};

const HEAT_GUIDANCE: Record<HazardSeverity, Guidance> = {
  Advisory: {
    summaryPattern:
      'A heat index of {heatIndexC}°C was recorded in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Drink water regularly and rest in shade or a cool place.',
      'Check on children, older adults, and people with health conditions.',
    ],
    prepare_list: [
      'Keep drinking water and needed medicines nearby.',
      'Plan outdoor tasks for cooler hours.',
    ],
    dont_list: [
      'Avoid long periods in direct sun.',
      'Never leave a person or pet in a parked vehicle.',
    ],
    emergency_note:
      'For confusion, fainting, or very hot skin, seek urgent medical help.',
  },
  Warning: {
    summaryPattern:
      'A heat index of {heatIndexC}°C reached the warning level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Drink water regularly and move strenuous activity to cooler hours.',
      'Stay in shade or a cool indoor place when possible.',
    ],
    prepare_list: [
      'Keep water and essential medicines accessible.',
      'Arrange check-ins for people at higher risk from heat.',
    ],
    dont_list: [
      'Avoid prolonged outdoor work during the hottest hours.',
      'Never leave a person or pet in a parked vehicle.',
    ],
    emergency_note:
      'For confusion, fainting, or very hot skin, seek urgent medical help.',
  },
  Severe: {
    summaryPattern:
      'A heat index of {heatIndexC}°C reached the severe level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Move to a cool indoor place and sip water regularly.',
      'Check on children, older adults, and people with health conditions.',
    ],
    prepare_list: [
      'Keep water, medicines, and a charged phone nearby.',
      'Ask local authorities about available cooling or assistance.',
    ],
    dont_list: [
      'Avoid strenuous activity and direct sun.',
      'Never leave a person or pet in a parked vehicle.',
    ],
    emergency_note:
      'For confusion, fainting, or very hot skin, seek urgent medical help.',
  },
  Extreme: {
    summaryPattern:
      'A heat index of {heatIndexC}°C reached the extreme level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Stay in a cool indoor place and drink water regularly.',
      'Check on people who may need help with heat exposure.',
    ],
    prepare_list: [
      'Keep medicines, water, and a charged phone available.',
      'Follow current health and local government advisories.',
    ],
    dont_list: [
      'Avoid outdoor exertion and direct sun.',
      'Never leave a person or pet in a parked vehicle.',
    ],
    emergency_note:
      'For confusion, fainting, or very hot skin, seek urgent medical help.',
  },
};

const AIR_GUIDANCE: Record<HazardSeverity, Guidance> = {
  Advisory: {
    summaryPattern:
      'An air-quality index of {aqi} was recorded in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Check updated air-quality readings before outdoor activity.',
      'People sensitive to pollution should take breaks indoors.',
    ],
    prepare_list: [
      'Keep prescribed respiratory medicines available.',
      'Plan a lower-exertion indoor option.',
    ],
    dont_list: [
      'Avoid strenuous exercise outdoors if you feel unwell.',
      'Do not burn waste or add smoke to the air.',
    ],
    emergency_note:
      'Seek medical advice for severe breathing difficulty or chest pain.',
  },
  Warning: {
    summaryPattern:
      'An air-quality index of {aqi} reached the warning level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Reduce prolonged outdoor activity, especially if you are sensitive.',
      'Keep windows closed when outdoor air is poor.',
    ],
    prepare_list: [
      'Keep prescribed respiratory medicines available.',
      'Check local health guidance and updated readings.',
    ],
    dont_list: [
      'Avoid strenuous outdoor exercise.',
      'Do not burn waste or add smoke to the air.',
    ],
    emergency_note:
      'Seek medical advice for severe breathing difficulty or chest pain.',
  },
  Severe: {
    summaryPattern:
      'An air-quality index of {aqi} reached the severe level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Stay indoors as much as possible and reduce outdoor exertion.',
      'Keep windows closed and follow local health guidance.',
    ],
    prepare_list: [
      'Keep prescribed medicines and a well-fitting mask available.',
      'Check on children and people with heart or lung conditions.',
    ],
    dont_list: [
      'Avoid strenuous outdoor activity.',
      'Do not burn waste or add smoke to the air.',
    ],
    emergency_note:
      'Seek medical advice for severe breathing difficulty or chest pain.',
  },
  Extreme: {
    summaryPattern:
      'An air-quality index of {aqi} reached the extreme level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Remain indoors where possible and follow local health guidance.',
      'Keep windows closed and reduce physical exertion.',
    ],
    prepare_list: [
      'Keep prescribed medicines available.',
      'Check on people with heart or lung conditions.',
    ],
    dont_list: [
      'Avoid outdoor exercise and unnecessary exposure.',
      'Do not burn waste or add smoke to the air.',
    ],
    emergency_note:
      'Seek medical advice for severe breathing difficulty or chest pain.',
  },
};

const RAIN_GUIDANCE: Record<HazardSeverity, Guidance> = {
  Advisory: {
    summaryPattern:
      'Rainfall of {rainMm} mm per hour was recorded in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Monitor local rainfall and flood updates.',
      'Move valuables and medicines away from areas that may get wet.',
    ],
    prepare_list: [
      'Keep a flashlight, drinking water, and a charged phone ready.',
      'Know a safe route to higher ground.',
    ],
    dont_list: [
      'Do not walk or drive through floodwater.',
      'Stay away from swollen rivers and drainage channels.',
    ],
    emergency_note:
      'If water rises quickly, move to higher ground and contact local emergency services.',
  },
  Warning: {
    summaryPattern:
      'Rainfall of {rainMm} mm per hour reached the warning level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Monitor local flood updates and move to higher ground if water rises.',
      'Follow evacuation directions from local authorities.',
    ],
    prepare_list: [
      'Keep medicines and important documents in a waterproof bag.',
      'Charge phones and identify a safe route.',
    ],
    dont_list: [
      'Never cross flooded roads, rivers, or bridges.',
      'Stay away from fallen power lines and drainage channels.',
    ],
    emergency_note:
      'If water rises quickly, move to higher ground and contact local emergency services.',
  },
  Severe: {
    summaryPattern:
      'Rainfall of {rainMm} mm per hour reached the severe level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Move away from flood-prone areas and follow local evacuation advice.',
      'Move to higher ground if floodwater begins to rise.',
    ],
    prepare_list: [
      'Keep medicines, water, and documents in a waterproof bag.',
      'Keep a flashlight and charged phone within reach.',
    ],
    dont_list: [
      'Never walk or drive through floodwater.',
      'Stay away from rivers, drainage channels, and downed wires.',
    ],
    emergency_note:
      'If water rises quickly, move to higher ground and contact local emergency services.',
  },
  Extreme: {
    summaryPattern:
      'Rainfall of {rainMm} mm per hour reached the extreme level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Move to a safer, higher place and follow local evacuation advice.',
      'Help children, older adults, and anyone needing assistance.',
    ],
    prepare_list: [
      'Take essential medicines, water, and a charged phone.',
      'Use routes confirmed safe by local authorities.',
    ],
    dont_list: [
      'Never cross floodwater on foot or in a vehicle.',
      'Do not touch electrical equipment or downed wires in wet areas.',
    ],
    emergency_note:
      'If water rises quickly, move to higher ground and contact local emergency services.',
  },
};

const WEATHER_GUIDANCE: Record<HazardSeverity, Guidance> = {
  Advisory: {
    summaryPattern:
      '{hazardType} conditions were detected in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Monitor official PAGASA and local government updates.',
      'Follow instructions from local authorities.',
    ],
    prepare_list: [
      'Keep essential medicines and a charged phone nearby.',
      'Know a safe indoor place and evacuation route.',
    ],
    dont_list: [
      'Avoid unnecessary exposure to hazardous conditions.',
      'Do not enter flooded roads or areas with downed wires.',
    ],
    emergency_note: 'For immediate danger, contact local emergency services.',
  },
  Warning: {
    summaryPattern:
      '{hazardType} conditions reached the warning level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Monitor official PAGASA and local government updates.',
      'Follow instructions from local authorities.',
    ],
    prepare_list: [
      'Keep essential medicines, water, and a charged phone nearby.',
      'Know a safe indoor place and evacuation route.',
    ],
    dont_list: [
      'Avoid unnecessary travel through hazardous areas.',
      'Do not enter flooded roads or areas with downed wires.',
    ],
    emergency_note: 'For immediate danger, contact local emergency services.',
  },
  Severe: {
    summaryPattern:
      '{hazardType} conditions reached the severe level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Stay in a safe place and follow local authority instructions.',
      'Monitor official PAGASA and local government updates.',
    ],
    prepare_list: [
      'Keep essential medicines, water, and a charged phone nearby.',
      'Prepare to use a safe route if authorities advise evacuation.',
    ],
    dont_list: [
      'Avoid travel through exposed or hazardous areas.',
      'Do not approach downed wires or floodwater.',
    ],
    emergency_note: 'For immediate danger, contact local emergency services.',
  },
  Extreme: {
    summaryPattern:
      '{hazardType} conditions reached the extreme level in {place} at {observedAt}. Source: {sourceName}.',
    do_list: [
      'Move to a safe place and follow local authority instructions.',
      'Monitor official PAGASA and local government updates.',
    ],
    prepare_list: [
      'Keep essential medicines, water, and a charged phone nearby.',
      'Use evacuation routes only when advised and confirmed safe.',
    ],
    dont_list: [
      'Avoid travel through exposed or hazardous areas.',
      'Do not approach downed wires or floodwater.',
    ],
    emergency_note: 'For immediate danger, contact local emergency services.',
  },
};

export const HAZARD_TEMPLATES: Record<HazardTemplateKey, HazardTemplate> = {
  extreme_heat: {
    titlePattern: 'Extreme Heat {severity} in {place}',
    severity: HEAT_GUIDANCE,
  },
  unhealthy_air: {
    titlePattern: 'Unhealthy Air {severity} in {place}',
    severity: AIR_GUIDANCE,
  },
  heavy_rain_flood: {
    titlePattern: '{hazardType} {severity} in {place}',
    severity: RAIN_GUIDANCE,
  },
  pagasa_weather: {
    titlePattern: '{hazardType} {severity} in {place}',
    severity: WEATHER_GUIDANCE,
  },
};

export function hazardTemplateKey(
  eventType: string | null | undefined,
  hazardType: string | null | undefined,
): HazardTemplateKey {
  const text = `${eventType ?? ''} ${hazardType ?? ''}`.toLocaleLowerCase();
  if (text.includes('heat')) return 'extreme_heat';
  if (text.includes('air') || text.includes('aqi')) return 'unhealthy_air';
  if (/rain|flood|precip/.test(text)) return 'heavy_rain_flood';
  return 'pagasa_weather';
}

export function renderHazardTemplate(input: {
  key: HazardTemplateKey;
  hazardType: string;
  severity: string;
  place: string;
  observedAt: string;
  sourceName: string;
  measurements: Record<string, number | null | undefined>;
}) {
  const severity: HazardSeverity =
    input.severity === 'Extreme' || input.severity === 'Severe'
      ? input.severity
      : input.severity === 'Advisory'
        ? 'Advisory'
        : 'Warning';
  const guidance = HAZARD_TEMPLATES[input.key].severity[severity];
  const values: Record<string, string> = {
    hazardType: input.hazardType,
    severity,
    place: input.place,
    observedAt: input.observedAt,
    sourceName: input.sourceName,
    heatIndexC: formatMeasurement(input.measurements.heatIndexC, '°C'),
    aqi: formatMeasurement(input.measurements.aqi, ''),
    rainMm: formatMeasurement(input.measurements.rainMm, ' mm'),
  };
  const interpolate = (pattern: string) =>
    pattern.replace(/\{([^}]+)\}/g, (_match, key: string) => values[key] ?? '');
  const title = interpolate(HAZARD_TEMPLATES[input.key].titlePattern);
  const summary = interpolate(guidance.summaryPattern);
  const safetyTips = {
    version: HAZARD_TEMPLATE_VERSION,
    hazard_type: input.hazardType,
    severity,
    title,
    short_summary: summary,
    do_list: guidance.do_list,
    prepare_list: guidance.prepare_list,
    dont_list: guidance.dont_list,
    emergency_note: guidance.emergency_note,
    observed_at: input.observedAt,
    source_name: input.sourceName,
  };
  return { title, summary, safetyTips };
}

function formatMeasurement(value: number | null | undefined, suffix: string) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)}${suffix}`
    : 'unavailable';
}
