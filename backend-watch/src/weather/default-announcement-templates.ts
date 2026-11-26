import {
  renderHazardTemplate,
  type HazardTemplateKey,
} from './hazard-templates';

const WEATHER_ANNOUNCEMENT_TEMPLATE_DEFINITIONS = [
  {
    key: 'extreme_heat',
    category: 'Extreme Heat',
    hazardTemplateKey: 'extreme_heat',
    hazardType: 'Extreme heat',
    title: 'Extreme Heat Safety Guide',
    summary:
      'General safety guidance for extreme heat. Check local forecasts and health advisories for current conditions.',
  },
  {
    key: 'unhealthy_air',
    category: 'Unhealthy Air',
    hazardTemplateKey: 'unhealthy_air',
    hazardType: 'Unhealthy air quality',
    title: 'Unhealthy Air Safety Guide',
    summary:
      'General guidance for poor air quality. Check current AQI readings and local health advisories.',
  },
  {
    key: 'heavy_rain',
    category: 'Heavy Rain/Flood',
    hazardTemplateKey: 'heavy_rain_flood',
    hazardType: 'Heavy rain and flooding',
    title: 'Heavy Rain and Flood Safety Guide',
    summary:
      'General safety guidance for heavy rain and possible flooding. Follow local warnings and evacuation instructions.',
  },
  {
    key: 'pagasa_weather',
    category: 'PAGASA/Weather',
    hazardTemplateKey: 'pagasa_weather',
    hazardType: 'Severe weather',
    title: 'PAGASA and Severe Weather Safety Guide',
    summary:
      'General severe-weather safety guidance. Check current official PAGASA advisories and local government instructions.',
  },
] as const satisfies readonly {
  key: string;
  category: string;
  hazardTemplateKey: HazardTemplateKey;
  hazardType: string;
  title: string;
  summary: string;
}[];

export type DefaultAnnouncementTemplateKey =
  (typeof WEATHER_ANNOUNCEMENT_TEMPLATE_DEFINITIONS)[number]['key'];

export function getDefaultAnnouncementTemplates() {
  return WEATHER_ANNOUNCEMENT_TEMPLATE_DEFINITIONS.map((definition) => {
    const { safetyTips } = renderHazardTemplate({
      key: definition.hazardTemplateKey,
      hazardType: definition.hazardType,
      severity: 'Warning',
      place: 'your area',
      observedAt: 'when this guide is sent',
      sourceName: 'W.A.T.C.H.',
      measurements: {},
    });

    return {
      ...definition,
      source_name: 'W.A.T.C.H. Default Safety Guide',
      source_url: null,
      content: definition.summary,
      ai_summary: definition.summary,
      safety_tips: {
        ...safetyTips,
        title: definition.title,
        short_summary: definition.summary,
      },
    };
  });
}

export function getDefaultAnnouncementTemplate(
  key: string,
): ReturnType<typeof getDefaultAnnouncementTemplates>[number] | null {
  return (
    getDefaultAnnouncementTemplates().find(
      (template) => template.key === key,
    ) ?? null
  );
}
