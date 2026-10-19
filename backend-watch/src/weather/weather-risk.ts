export function classifyWeatherRisk(
  rainMm: number,
  windKph: number,
  heatIndexC: number,
) {
  if (windKph >= 88 || rainMm >= 50 || heatIndexC >= 52) {
    return {
      level: 'Severe',
      reason: 'A measured weather value has reached the configured severe threshold.',
    };
  }
  if (windKph >= 62 || rainMm >= 30 || heatIndexC >= 42) {
    return {
      level: 'Warning',
      reason: 'Weather conditions have crossed a configured warning threshold.',
    };
  }
  if (windKph >= 39 || rainMm >= 15 || heatIndexC >= 33) {
    return {
      level: 'Advisory',
      reason: 'Weather conditions have crossed a configured advisory threshold.',
    };
  }
  return { level: 'Normal', reason: 'No configured threshold is currently exceeded.' };
}
