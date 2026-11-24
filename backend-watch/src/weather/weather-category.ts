import type { HazardTemplateKey } from './hazard-templates';

export type WeatherAnnouncementCategory =
  'Extreme Heat' | 'Unhealthy Air' | 'Heavy Rain/Flood' | 'PAGASA/Weather';

export type WeatherAnnouncementClassification = {
  category: WeatherAnnouncementCategory;
  templateKey: HazardTemplateKey;
};

export function classifyWeatherAnnouncement(input: {
  eventType: string | null;
  hazardType: string | null;
  category: string | null;
  sourceType: string | null;
}): WeatherAnnouncementClassification | null {
  const text = [input.eventType, input.hazardType, input.category]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  if (/heat|thermal/.test(text)) {
    return { category: 'Extreme Heat', templateKey: 'extreme_heat' };
  }
  if (/air.?quality|air.?pollution|\baqi\b/.test(text)) {
    return { category: 'Unhealthy Air', templateKey: 'unhealthy_air' };
  }
  if (/rain|flood|precip/.test(text)) {
    return { category: 'Heavy Rain/Flood', templateKey: 'heavy_rain_flood' };
  }
  if (
    input.sourceType === 'pagasa' ||
    /pagasa|weather|typhoon|cyclone|wind|storm/.test(text)
  ) {
    return { category: 'PAGASA/Weather', templateKey: 'pagasa_weather' };
  }
  return null;
}
