import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { AiService } from '../ai/ai.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import {
  CebuFloodBasin,
  HazardSeverity,
  LatLngPoint,
  matchCebuBasins,
  selectBasinPolygons,
} from './cebu-basins';
import { MapService } from './map.service';

export type MapHazardCategory = 'flood' | 'closure' | 'caution';
export type HazardSourceType =
  | 'pagasa'
  | 'project_noah'
  | 'ndrrmc_ocd'
  | 'lgu_official'
  | 'weather_auto';

export interface ParsedPagasaBulletin {
  title: string;
  text: string;
  sourceUrl: string;
  warningType: string;
  severity: HazardSeverity;
  mapCategory: MapHazardCategory;
  eventType: string;
  isTerminated: boolean;
  issuedDate: string;
}

export interface OfficialAnnouncementInput {
  id: number | string;
  source: string;
  source_type: string;
  source_url: string | null;
  title: string;
  content: string;
  published_at: string;
  category: string | null;
  ai_summary: string | null;
  affects_location: string | null;
  confidence: number | null;
  city: string | null;
}

interface SpatialHazardUpsertPayload {
  event_type: string;
  hazard_type: string;
  severity: HazardSeverity;
  risk_level: 'Advisory' | 'Warning' | 'Severe';
  map_category: MapHazardCategory;
  title: string;
  description: string;
  explanation: string;
  barangay: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  location_lat: number;
  location_lon: number;
  area_key: null;
  polygon: LatLngPoint[][] | null;
  path: LatLngPoint[] | null;
  radius_m: number | null;
  source_type: HazardSourceType;
  source_name: string;
  source_url: string | null;
  external_event_id: string;
  incident_group: string | null;
  started_at: string;
  detected_at: string;
  observed_at: string;
  resolved_at: string | null;
  ai_summary: string | null;
  safety_tips: {
    do: string[];
    prepare: string[];
    avoid: string[];
  };
  raw_metrics: Record<string, unknown>;
  measurements: Record<string, unknown>;
}

const DEFAULT_PAGASA_VISPRSD_URL =
  'https://www.pagasa.dost.gov.ph/regional-forecast/visayas';
const DEFAULT_PAGASA_FLOOD_URL = 'https://www.pagasa.dost.gov.ph/flood';
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

const CEBU_SIGNAL_REGEX =
  /\b(cebu|metro cebu|central visayas|mananga|butuanon|guadalupe|mahiga|lahug|kinalumsan|bulacao|cotcot|liloan|talisay|mandaue|lapu-lapu|danao|cons?olacion|minglanilla)\b/i;

function manilaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripMarkupToLines(raw: string): string[] {
  const withoutScripts = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/?(?:p|div|li|tr|h[1-6]|br|section|article|item|entry)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12);
}

function classifyPagasaText(text: string): {
  warningType: string;
  severity: HazardSeverity;
  mapCategory: MapHazardCategory;
  eventType: string;
  isTerminated: boolean;
} | null {
  const normalized = text.toLowerCase();
  const isTerminated =
    /\b(final advisory|warning terminated|advisory terminated|all clear|has been lifted|is hereby lifted|no active rainfall warning|no tropical cyclone)\b/i.test(
      normalized,
    );

  if (/\b(red rainfall warning|red warning|torrential rain)\b/i.test(normalized)) {
    return {
      warningType: 'red-rainfall',
      severity: 'Extreme',
      mapCategory: 'flood',
      eventType: 'FLASH_FLOOD_RISK',
      isTerminated,
    };
  }
  if (
    /\b(orange rainfall warning|orange warning|general flood advisory|flood advisory|flood bulletin)\b/i.test(
      normalized,
    )
  ) {
    return {
      warningType: normalized.includes('flood')
        ? 'flood-advisory'
        : 'orange-rainfall',
      severity: 'Severe',
      mapCategory: 'flood',
      eventType: 'FLASH_FLOOD_RISK',
      isTerminated,
    };
  }
  if (
    /\b(yellow rainfall warning|yellow warning|heavy rainfall warning)\b/i.test(
      normalized,
    )
  ) {
    return {
      warningType: 'yellow-rainfall',
      severity: 'Warning',
      mapCategory: 'flood',
      eventType: 'EXTREME_RAINFALL',
      isTerminated,
    };
  }
  if (
    /\b(tropical cyclone wind signal|tcws|storm surge warning)\b/i.test(
      normalized,
    )
  ) {
    const highSignal = /\b(signal\s*(?:no\.?\s*)?[345])\b/i.test(normalized);
    const medSignal = /\b(signal\s*(?:no\.?\s*)?2)\b/i.test(normalized);
    const hasFloodOrSurge = /\b(flood|storm surge|rain)\b/i.test(normalized);
    return {
      warningType: 'typhoon-signal',
      severity: highSignal ? 'Extreme' : medSignal ? 'Severe' : 'Warning',
      mapCategory: hasFloodOrSurge ? 'flood' : 'caution',
      eventType: 'TYPHOON_WIND',
      isTerminated,
    };
  }
  if (/\b(thunderstorm advisory|severe thunderstorm)\b/i.test(normalized)) {
    return {
      warningType: 'thunderstorm-advisory',
      severity: 'Advisory',
      mapCategory: /\b(flood|flash flood|overflow)\b/i.test(normalized)
        ? 'flood'
        : 'caution',
      eventType: 'SEVERE_STORM_LIGHTNING',
      isTerminated,
    };
  }
  return null;
}

/**
 * Pure parser for DOST-PAGASA VISPRSD / Flood Portal HTML, RSS/Atom XML, or JSON.
 * Never fabricates bulletins: returns an empty list if no active/terminated
 * Central Visayas or Cebu advisory block is detected.
 */
export function parsePagasaBulletins(
  rawBody: string,
  sourceUrl: string,
  today = manilaDateString(),
): ParsedPagasaBulletin[] {
  if (!rawBody || !rawBody.trim()) return [];

  const blocks: string[] = [];
  const trimmed = rawBody.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const items = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { features?: unknown[] }).features)
          ? (parsed as { features: unknown[] }).features
          : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object') {
          blocks.push(JSON.stringify(item));
        }
      }
    } catch {
      // Fall back to line extraction below.
    }
  }

  if (blocks.length === 0) {
    const xmlMatches = [...rawBody.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)];
    if (xmlMatches.length > 0) {
      for (const match of xmlMatches.slice(0, 25)) {
        const cleaned = stripMarkupToLines(match[0]).join(' ');
        if (cleaned) blocks.push(cleaned);
      }
    } else {
      const lines = stripMarkupToLines(rawBody);
      for (let i = 0; i < lines.length; i += 1) {
        const windowText = lines.slice(i, i + 3).join(' ');
        if (
          classifyPagasaText(lines[i]) &&
          CEBU_SIGNAL_REGEX.test(windowText)
        ) {
          blocks.push(windowText);
        }
      }
    }
  }

  const bulletins: ParsedPagasaBulletin[] = [];
  const seenKeys = new Set<string>();

  for (const block of blocks) {
    if (!CEBU_SIGNAL_REGEX.test(block)) continue;
    const classified = classifyPagasaText(block);
    if (!classified) continue;

    const dedupeKey = `${classified.warningType}:${classified.isTerminated}:${block.slice(0, 120).toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const dateMatch = block.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const issuedDate = dateMatch ? dateMatch[1] : today;
    const titlePrefix =
      classified.warningType === 'red-rainfall'
        ? 'PAGASA Red Rainfall Warning'
        : classified.warningType === 'orange-rainfall'
          ? 'PAGASA Orange Rainfall Warning'
          : classified.warningType === 'yellow-rainfall'
            ? 'PAGASA Yellow Rainfall Warning'
            : classified.warningType === 'flood-advisory'
              ? 'PAGASA General Flood Advisory'
              : classified.warningType === 'typhoon-signal'
                ? 'PAGASA Tropical Cyclone / Surge Warning'
                : 'PAGASA Thunderstorm Advisory';

    bulletins.push({
      title: titlePrefix,
      text: block.slice(0, 1600),
      sourceUrl,
      warningType: classified.warningType,
      severity: classified.severity,
      mapCategory: classified.mapCategory,
      eventType: classified.eventType,
      isTerminated: classified.isTerminated,
      issuedDate,
    });
  }

  return bulletins;
}

function defaultTipsForCategory(category: MapHazardCategory) {
  if (category === 'closure') {
    return {
      do: [
        'Use verified alternate routes and follow local traffic enforcers.',
        'Monitor LGU DRRMO and DPWH clearing advisories.',
        'Allow extra travel time if commuting across Metro Cebu.',
      ],
      prepare: [
        'Keep emergency contacts and charged phones ready before traveling.',
        'Check updated route status prior to departure.',
        'Carry drinking water and basic supplies in vehicles.',
      ],
      avoid: [
        'Do not bypass road barricades or enter cordoned sections.',
        'Avoid downed power lines, unstable slopes, or damaged bridges.',
        'Do not drive into flooded detours.',
      ],
    };
  }
  if (category === 'caution') {
    return {
      do: [
        'Slow down and exercise caution near the affected corridor.',
        'Monitor official PAGASA and local government updates.',
        'Stay indoors during severe lightning or gusty conditions.',
      ],
      prepare: [
        'Keep rain gear, flashlights, and charged phones handy.',
        'Identify safe indoor shelter if weather deteriorates.',
        'Leave early or delay non-essential travel.',
      ],
      avoid: [
        'Avoid open fields, tall trees, and metallic structures during thunderstorms.',
        'Stay clear of stalled vehicles, debris, and slick road shoulders.',
        'Do not ignore local traffic or safety advisories.',
      ],
    };
  }
  return {
    do: [
      'Monitor DOST-PAGASA VISPRSD and local DRRMO flood bulletins.',
      'Move valuables above floor level and prepare to move to higher ground.',
      'Follow evacuation instructions from barangay or city officials.',
    ],
    prepare: [
      'Pack medicines, drinking water, documents, and flashlights in a waterproof bag.',
      'Charge phones and backup power banks.',
      'Identify the nearest safe route and evacuation center.',
    ],
    avoid: [
      'Never walk, swim, or drive through moving floodwater.',
      'Stay clear of swollen rivers, creeks, and open drainage channels.',
      'Do not touch electrical equipment while standing in water.',
    ],
  };
}

function classifyDeterministicAnnouncement(
  text: string,
): {
  mapCategory: MapHazardCategory;
  severity: HazardSeverity;
  eventType: string;
  isResolved: boolean;
  roadStart: string | null;
  roadEnd: string | null;
} | null {
  const lower = text.toLowerCase();
  const isResolved =
    /\b(passable|reopened|now open|road cleared|water subsided|floodwaters subsided|receded|lifted|back to normal)\b/i.test(
      lower,
    );

  const isClosure =
    /\b(road closed|road closure|impassable|cordoned|landslide|rockslide|collapsed bridge|bridge closed|washout|fallen electric post|downed power line|blocked lane)\b/i.test(
      lower,
    );
  const isFlood =
    /\b(flood|flooding|flash flood|overflow|submerged|waist[- ]deep|knee[- ]deep|chest[- ]deep|water rising|river swelling)\b/i.test(
      lower,
    );
  const isCaution =
    /\b(slippery|oil spill|stalled truck|debris|fallen tree|minor landslide|lane restriction|heavy congestion|storm surge watch|mudslide)\b/i.test(
      lower,
    );

  if (!isClosure && !isFlood && !isCaution) {
    return null;
  }

  let mapCategory: MapHazardCategory = 'caution';
  let eventType = 'ROAD_CAUTION';
  if (isClosure) {
    mapCategory = 'closure';
    eventType = 'ROAD_CLOSURE';
  } else if (isFlood) {
    mapCategory = 'flood';
    eventType = 'FLASH_FLOOD_RISK';
  }

  let severity: HazardSeverity = 'Warning';
  if (
    /\b(extreme|catastrophic|chest[- ]deep|impassable|red warning|signal no\.?\s*[345]|evacuate immediately)\b/i.test(
      lower,
    )
  ) {
    severity = isClosure || /\b(extreme|catastrophic)\b/i.test(lower) ? 'Extreme' : 'Severe';
  } else if (
    /\b(severe|waist[- ]deep|orange warning|major landslide|closed to all vehicles)\b/i.test(
      lower,
    )
  ) {
    severity = 'Severe';
  } else if (/\b(advisory|ankle[- ]deep|passable|minor|slow moving)\b/i.test(lower)) {
    severity = 'Advisory';
  }

  const corridorMatch = text.match(
    /(?:from|between)\s+([A-Za-z0-9.\s'-]{3,45}?)\s+(?:to|and)\s+([A-Za-z0-9.\s'-]{3,45}?)(?:[.,;\n]|$)/i,
  );
  const roadStart = corridorMatch?.[1]?.trim() ?? null;
  const roadEnd = corridorMatch?.[2]?.trim() ?? null;

  return {
    mapCategory,
    severity,
    eventType,
    isResolved,
    roadStart,
    roadEnd,
  };
}

function toRiskLevel(
  severity: HazardSeverity,
): 'Advisory' | 'Warning' | 'Severe' {
  return severity === 'Extreme' ? 'Severe' : severity;
}

@Injectable()
export class HazardIngestionService {
  private readonly logger = new Logger(HazardIngestionService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
    private readonly ai: AiService,
    private readonly mapService: MapService,
  ) { }

  @Cron('*/15 * * * *', { waitForCompletion: true })
  async pollPagasaAdvisories(): Promise<{
    bulletinsFound: number;
    upserted: number;
    resolved: number;
  }> {
    const extraFeeds = (this.config.get<string>('PAGASA_FEED_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const urls = [
      ...new Set([
        this.config.get<string>('PAGASA_VISPRSD_URL') ??
        DEFAULT_PAGASA_VISPRSD_URL,
        this.config.get<string>('PAGASA_FLOOD_URL') ?? DEFAULT_PAGASA_FLOOD_URL,
        ...extraFeeds,
      ]),
    ];

    let bulletinsFound = 0;
    let upserted = 0;
    let resolved = 0;
    const nowIso = new Date().toISOString();

    for (const url of urls) {
      let body: string;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'W.A.T.C.H. weather-safety-app',
            Accept:
              'text/html, application/xhtml+xml, application/xml, application/rss+xml, application/json',
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) {
          this.logger.warn(
            `PAGASA feed ${url} returned HTTP ${response.status}; keeping existing hazard records intact.`,
          );
          continue;
        }
        body = await response.text();
      } catch (error) {
        this.logger.warn(
          `PAGASA feed ${url} is unreachable (${error instanceof Error ? error.message : 'Unknown error'}); preserving existing hazards.`,
        );
        continue;
      }

      const bulletins = parsePagasaBulletins(body, url);
      bulletinsFound += bulletins.length;

      for (const bulletin of bulletins) {
        const aiExtracted = await this.ai.extractSpatialHazard({
          text: bulletin.text,
          sourceName: 'DOST-PAGASA VISPRSD',
          city: 'Cebu',
        });

        const searchCorpus = [
          bulletin.text,
          aiExtracted?.city,
          aiExtracted?.barangay,
          ...(aiExtracted?.affectedAreas ?? []),
        ]
          .filter(Boolean)
          .join(' ');

        const basins = matchCebuBasins(searchCorpus);
        const severity = aiExtracted?.severity ?? bulletin.severity;
        const isTerminated =
          bulletin.isTerminated || aiExtracted?.isResolved === true;

        if (isTerminated) {
          resolved += await this.resolveActivePagasaBasins(basins, nowIso);
          continue;
        }

        if (basins.length === 0) continue;

        for (const basin of basins) {
          const polygon = selectBasinPolygons(basin, severity);
          const payload: SpatialHazardUpsertPayload = {
            event_type: bulletin.eventType,
            hazard_type:
              bulletin.mapCategory === 'flood'
                ? 'Flooding risk'
                : 'Severe weather hazard',
            severity,
            risk_level: toRiskLevel(severity),
            map_category: bulletin.mapCategory,
            title: `${basin.name} — ${bulletin.title}`,
            description:
              aiExtracted?.summary ??
              `${bulletin.title} affecting ${basin.name} (${basin.barangays.slice(0, 4).join(', ')}).`,
            explanation: bulletin.text.slice(0, 600),
            barangay: basin.barangays.join(', '),
            city: basin.city,
            latitude: basin.center.latitude,
            longitude: basin.center.longitude,
            location_lat: basin.center.latitude,
            location_lon: basin.center.longitude,
            area_key: null,
            polygon,
            path: null,
            radius_m: null,
            source_type: 'pagasa',
            source_name: 'DOST-PAGASA VISPRSD / UP NOAH',
            source_url: bulletin.sourceUrl,
            external_event_id: `pagasa:${bulletin.issuedDate}:${bulletin.warningType}:${basin.id}`,
            incident_group: null,
            started_at: nowIso,
            detected_at: nowIso,
            observed_at: nowIso,
            resolved_at: null,
            ai_summary:
              aiExtracted?.summary ??
              `${bulletin.title} in ${basin.city}. Follow official PAGASA/LGU advisories.`,
            safety_tips: defaultTipsForCategory(bulletin.mapCategory),
            raw_metrics: {
              warningType: bulletin.warningType,
              basinId: basin.id,
            },
            measurements: {
              warningType: bulletin.warningType,
              basinId: basin.id,
            },
          };
          const saved = await this.upsertSpatialHazardRow(payload);
          if (saved) upserted += 1;
        }
      }
    }

    return { bulletinsFound, upserted, resolved };
  }

  /**
   * Bridges verified official LGU/DRRMO/DPWH announcements from `AlertsService`
   * into spatial map hazards (polygons for flood basins, OSRM-snapped paths for road closures).
   */
  async ingestFromOfficialAnnouncement(
    announcement: OfficialAnnouncementInput,
  ): Promise<{ ingested: boolean; reason?: string; hazardIds?: string[] }> {
    const isOfficialSource =
      announcement.source_type === 'lgu' ||
      /(drrmo|cdrrmo|pdrrmo|dpwh|pagasa|ndrrmc|ocd|cebu city|mandaue|talisay|lapu-lapu)/i.test(
        announcement.source,
      );

    if (!isOfficialSource) {
      return { ingested: false, reason: 'non-official-source' };
    }
    if ((announcement.confidence ?? 0) < 0.75) {
      return { ingested: false, reason: 'low-confidence' };
    }

    const fullText = [
      announcement.title,
      announcement.content,
      announcement.affects_location,
      announcement.city,
    ]
      .filter(Boolean)
      .join('\n');

    const deterministic = classifyDeterministicAnnouncement(fullText);
    const aiExtracted = await this.ai.extractSpatialHazard({
      text: fullText,
      sourceName: announcement.source,
      city: announcement.city,
    });

    const mapCategory =
      aiExtracted?.isSpatialHazard && aiExtracted.mapCategory
        ? aiExtracted.mapCategory
        : deterministic?.mapCategory ?? null;

    if (!mapCategory) {
      return { ingested: false, reason: 'non-spatial' };
    }

    const severity: HazardSeverity =
      aiExtracted?.severity ?? deterministic?.severity ?? 'Warning';
    const isResolved =
      aiExtracted?.isResolved === true || deterministic?.isResolved === true;
    const city = aiExtracted?.city ?? announcement.city ?? 'Cebu City';
    const barangay =
      aiExtracted?.barangay ?? announcement.affects_location ?? null;
    const startedAt = announcement.published_at || new Date().toISOString();

    if (isResolved) {
      await this.resolveOfficialAnnouncementHazards(
        city,
        mapCategory,
        startedAt,
      );
      return { ingested: true, reason: 'resolved-existing' };
    }

    const hazardIds: string[] = [];

    if (mapCategory === 'flood') {
      const basinCorpus = [
        fullText,
        barangay,
        city,
        ...(aiExtracted?.affectedAreas ?? []),
      ]
        .filter(Boolean)
        .join(' ');
      const basins = matchCebuBasins(basinCorpus);

      if (basins.length > 0) {
        for (const basin of basins) {
          const id = await this.upsertSpatialHazardRow({
            event_type: 'FLASH_FLOOD_RISK',
            hazard_type: 'Flooding risk',
            severity,
            risk_level: toRiskLevel(severity),
            map_category: 'flood',
            title:
              aiExtracted?.title ??
              `${basin.name} — ${announcement.source}`,
            description:
              aiExtracted?.summary ??
              announcement.ai_summary ??
              announcement.content.slice(0, 400),
            explanation: announcement.content.slice(0, 600),
            barangay: barangay ?? basin.barangays.slice(0, 4).join(', '),
            city: basin.city || city,
            latitude: basin.center.latitude,
            longitude: basin.center.longitude,
            location_lat: basin.center.latitude,
            location_lon: basin.center.longitude,
            area_key: null,
            polygon: selectBasinPolygons(basin, severity),
            path: null,
            radius_m: null,
            source_type: 'lgu_official',
            source_name: `${announcement.source} / UP NOAH`,
            source_url: announcement.source_url,
            external_event_id: `announcement:${announcement.id}:${basin.id}`,
            incident_group: null,
            started_at: startedAt,
            detected_at: startedAt,
            observed_at: startedAt,
            resolved_at: null,
            ai_summary: aiExtracted?.summary ?? announcement.ai_summary,
            safety_tips: defaultTipsForCategory('flood'),
            raw_metrics: { announcementId: announcement.id, basinId: basin.id },
            measurements: { announcementId: announcement.id, basinId: basin.id },
          });
          if (id) hazardIds.push(id);
        }
        return { ingested: true, hazardIds };
      }
    }

    const roadStart =
      aiExtracted?.roadStart ?? deterministic?.roadStart ?? null;
    const roadEnd = aiExtracted?.roadEnd ?? deterministic?.roadEnd ?? null;

    let path: LatLngPoint[] | null = null;
    let center: LatLngPoint | null = null;

    if (roadStart && roadEnd) {
      const [startGeo, endGeo] = await Promise.all([
        this.safeGeocode(`${roadStart}, ${city}, Cebu, Philippines`),
        this.safeGeocode(`${roadEnd}, ${city}, Cebu, Philippines`),
      ]);
      if (startGeo && endGeo) {
        path = await this.snapRoadWithOsrm(startGeo, endGeo);
        const mid = path[Math.floor(path.length / 2)];
        center = mid ?? startGeo;
      }
    }

    if (!center) {
      const targetQuery =
        aiExtracted?.affectedAreas?.[0] ?? barangay ?? announcement.title;
      center =
        (await this.safeGeocode(`${targetQuery}, ${city}, Cebu, Philippines`)) ??
        (await this.safeGeocode(`${city}, Cebu, Philippines`)) ?? {
          latitude: 10.3157,
          longitude: 123.8854,
        };
    }

    const id = await this.upsertSpatialHazardRow({
      event_type:
        deterministic?.eventType ??
        (mapCategory === 'closure' ? 'ROAD_CLOSURE' : 'ROAD_CAUTION'),
      hazard_type:
        mapCategory === 'closure' ? 'Road closure' : 'Road / area caution',
      severity,
      risk_level: toRiskLevel(severity),
      map_category: mapCategory,
      title: aiExtracted?.title ?? announcement.title.slice(0, 140),
      description:
        aiExtracted?.summary ??
        announcement.ai_summary ??
        announcement.content.slice(0, 400),
      explanation: announcement.content.slice(0, 600),
      barangay,
      city,
      latitude: center.latitude,
      longitude: center.longitude,
      location_lat: center.latitude,
      location_lon: center.longitude,
      area_key: null,
      polygon: null,
      path,
      radius_m: path ? null : mapCategory === 'flood' ? 400 : 250,
      source_type: 'lgu_official',
      source_name: announcement.source,
      source_url: announcement.source_url,
      external_event_id: `announcement:${announcement.id}`,
      incident_group: null,
      started_at: startedAt,
      detected_at: startedAt,
      observed_at: startedAt,
      resolved_at: null,
      ai_summary: aiExtracted?.summary ?? announcement.ai_summary,
      safety_tips: defaultTipsForCategory(mapCategory),
      raw_metrics: { announcementId: announcement.id },
      measurements: { announcementId: announcement.id },
    });
    if (id) hazardIds.push(id);

    return { ingested: hazardIds.length > 0, hazardIds };
  }

  private async safeGeocode(query: string): Promise<LatLngPoint | null> {
    try {
      const geo = await this.mapService.geocode(query);
      if (
        Number.isFinite(geo.latitude) &&
        Number.isFinite(geo.longitude)
      ) {
        return { latitude: geo.latitude, longitude: geo.longitude };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async snapRoadWithOsrm(
    start: LatLngPoint,
    end: LatLngPoint,
  ): Promise<LatLngPoint[]> {
    const baseUrl = (
      this.config.get<string>('OSRM_BASE_URL') ?? DEFAULT_OSRM_BASE_URL
    ).replace(/\/$/, '');
    const coords = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
    const url = `${baseUrl}/route/v1/driving/${coords}?geometries=geojson&overview=full`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return [start, end];
      const body = (await response.json()) as {
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      const line = body.routes?.[0]?.geometry?.coordinates;
      if (!line || line.length < 2) return [start, end];
      return line.map(([longitude, latitude]) => ({ latitude, longitude }));
    } catch {
      return [start, end];
    }
  }

  private async resolveActivePagasaBasins(
    basins: CebuFloodBasin[],
    resolvedAt: string,
  ): Promise<number> {
    const query = this.supabase
      .from('hazards')
      .update({ resolved_at: resolvedAt })
      .eq('source_type', 'pagasa')
      .is('resolved_at', null);

    if (basins.length > 0) {
      const cities = [...new Set(basins.map((b) => b.city))];
      const { data, error } = await query.in('city', cities).select('id');
      if (error) {
        this.logger.warn(
          `Could not resolve terminated PAGASA hazards: ${error.message}`,
        );
        return 0;
      }
      return Array.isArray(data) ? data.length : 0;
    }

    const { data, error } = await query.select('id');
    if (error) {
      this.logger.warn(
        `Could not resolve terminated PAGASA hazards: ${error.message}`,
      );
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  }

  private async resolveOfficialAnnouncementHazards(
    city: string,
    mapCategory: MapHazardCategory,
    resolvedAt: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('hazards')
      .update({ resolved_at: resolvedAt })
      .eq('source_type', 'lgu_official')
      .eq('city', city)
      .eq('map_category', mapCategory)
      .is('resolved_at', null);
    if (error) {
      this.logger.warn(
        `Could not resolve cleared LGU hazards in ${city}: ${error.message}`,
      );
    }
  }

  private async upsertSpatialHazardRow(
    payload: SpatialHazardUpsertPayload,
  ): Promise<string | null> {
    const { data: existing, error: lookupError } = await this.supabase
      .from('hazards')
      .select('id')
      .eq('source_type', payload.source_type)
      .eq('external_event_id', payload.external_event_id)
      .maybeSingle();

    if (lookupError) {
      this.logger.error(
        `Spatial hazard lookup failed (${payload.external_event_id}): ${lookupError.message}`,
      );
      return null;
    }

    if (existing && typeof existing.id === 'string') {
      const { error: updateError } = await this.supabase
        .from('hazards')
        .update({
          event_type: payload.event_type,
          hazard_type: payload.hazard_type,
          severity: payload.severity,
          risk_level: payload.risk_level,
          map_category: payload.map_category,
          title: payload.title,
          description: payload.description,
          explanation: payload.explanation,
          barangay: payload.barangay,
          city: payload.city,
          latitude: payload.latitude,
          longitude: payload.longitude,
          location_lat: payload.location_lat,
          location_lon: payload.location_lon,
          polygon: payload.polygon,
          path: payload.path,
          radius_m: payload.radius_m,
          source_name: payload.source_name,
          source_url: payload.source_url,
          incident_group: payload.incident_group,
          observed_at: payload.observed_at,
          resolved_at: payload.resolved_at,
          ai_summary: payload.ai_summary,
          safety_tips: payload.safety_tips,
          raw_metrics: payload.raw_metrics,
          measurements: payload.measurements,
        })
        .eq('id', existing.id);

      if (updateError) {
        this.logger.error(
          `Spatial hazard update failed (${existing.id}): ${updateError.message}`,
        );
        return null;
      }
      return existing.id;
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from('hazards')
      .insert(payload)
      .select('id')
      .single();

    if (insertError?.code === '23505') {
      const { data: conflictRow } = await this.supabase
        .from('hazards')
        .select('id')
        .eq('source_type', payload.source_type)
        .eq('external_event_id', payload.external_event_id)
        .maybeSingle();
      return typeof conflictRow?.id === 'string' ? conflictRow.id : null;
    }

    if (insertError || !inserted || typeof inserted.id !== 'string') {
      this.logger.error(
        `Spatial hazard insert failed (${payload.external_event_id}): ${insertError?.message ?? 'No row returned'}`,
      );
      return null;
    }

    return inserted.id;
  }
}
