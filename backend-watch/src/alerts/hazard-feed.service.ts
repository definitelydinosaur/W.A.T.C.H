import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import {
  areasMatch,
  distanceKm,
  extractAreaMentions,
  HazardAreaLocation,
  normalizeAreaKey,
  normalizeAreaName,
  placeName,
} from '../weather/hazard-area';
import { renderHazardTemplate } from '../weather/hazard-templates';
import { classifyWeatherAnnouncement } from '../weather/weather-category';

type HazardRow = HazardAreaLocation & {
  id: string;
  category: string | null;
  event_type: string | null;
  hazard_type: string | null;
  severity: string | null;
  risk_level: string | null;
  title: string | null;
  description: string | null;
  ai_summary: string | null;
  source_type: string | null;
  source_name: string | null;
  source_url: string | null;
  area_key: string | null;
  dedupe_key: string | null;
  measurements: unknown;
  safety_tips: unknown;
  observed_at: string | null;
  detected_at: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at: string | null;
  location_id: number | null;
};

type LocationRow = HazardAreaLocation & {
  loc_id: number;
  user_id: string | null;
  label: string | null;
  full_address: string | null;
};

type NotificationRow = {
  id: string;
  hazard_id: string | null;
  announcement_id: number | null;
  user_id: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
};

type PagasaRow = {
  id: number;
  event: string | null;
  content: string | null;
  severity: string | null;
  alert_status: string | null;
  published_at: string | null;
  expires: string | null;
  affected_areas: string[] | null;
  area_review_status: string | null;
  notification_announcement_id: number | null;
};

type AnnouncementRow = {
  id: number;
  title: string | null;
  content: string | null;
  ai_summary: string | null;
  source: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
  category: string | null;
  ai_scope: string | null;
  source_type: string | null;
  city: string | null;
  pagasa_alert_id: number | null;
};

type WeatherAlertEventRow = {
  id: string;
  alert_type: 'extreme_heat' | 'unhealthy_air' | 'heavy_rain' | 'pagasa_weather';
  city: string;
  province: string | null;
  area_key: string;
  severity: string;
  measurement: unknown;
  measured_at: string;
  sustained_since: string;
  title: string;
  ai_summary: string;
  safety: unknown;
  source: 'weather_auto' | 'pagasa';
  source_name: string;
  source_url: string | null;
  status: 'active' | 'resolved';
  resolved_at: string | null;
  notified_count: number;
};

type FeedEvent = {
  id: string;
  item_type:
    | 'announcement'
    | 'hazard'
    | 'pagasa'
    | 'weather_event';
  announcement_id: number | null;
  hazard_id: string | null;
  pagasa_id: number | null;
  title: string;
  content: string;
  ai_summary: string;
  source_name: string;
  source_url: string | null;
  source_type: string;
  category: string;
  severity: string | null;
  event_type: string | null;
  area_key: string;
  city: string | null;
  province: string | null;
  place_name: string;
  affected_areas: string[];
  requires_area_review: boolean;
  published_at: string;
  observed_at: string | null;
  measurements: unknown;
  notification_counts: Record<string, number>;
  audience_count: number;
  hazard_ids: string[];
  active: boolean;
  window_key: string;
  safety_tips: unknown;
};

const EVENT_PAGE_LIMIT = 5000;
@Injectable()
export class HazardFeedService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getAdminEvents(input: {
    page?: string;
    limit?: string;
    search?: string;
    category?: string;
  }) {
    const page = Math.max(0, Number.parseInt(input.page ?? '0', 10) || 0);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(input.limit ?? '20', 10) || 20),
    );
    const events = await this.loadEvents(true);
    const search = input.search?.trim().toLocaleLowerCase();
    const category = input.category?.trim();
    const filtered = events.filter((event) => {
      if (category && category !== 'All' && event.category !== category) {
        return false;
      }
      if (!search) return true;
      return `${event.title} ${event.content} ${event.source_name} ${event.place_name}`
        .toLocaleLowerCase()
        .includes(search);
    });
    const items = filtered.slice(page * limit, (page + 1) * limit);
    return {
      items,
      page,
      limit,
      has_more: filtered.length > (page + 1) * limit,
    };
  }

  async getUserEvents(userId: string, pageValue?: string, limitValue?: string) {
    const page = Math.max(0, Number.parseInt(pageValue ?? '0', 10) || 0);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(limitValue ?? '20', 10) || 20),
    );
    const [events, userLocations] = await Promise.all([
      this.loadEvents(),
      this.getUserLocations(userId),
    ]);
    const visible = events.filter((event) =>
      userLocations.some((location) =>
        event.item_type === 'pagasa'
          ? event.affected_areas.some((area) =>
              areasMatch(parseArea(area), location),
            )
          : areasMatch(
              {
                city: event.city,
                province: event.province,
                latitude: null,
                longitude: null,
              },
              location,
            ),
      ),
    );
    const hazardIds = [
      ...new Set(visible.flatMap((event) => event.hazard_ids)),
    ];
    const announcementIds = visible
      .map((event) => event.announcement_id)
      .filter((id): id is number => id !== null);
    const notifications = await this.getNotifications(
      hazardIds,
      announcementIds,
      userId,
    );
    const notificationByEvent = new Map<string, NotificationRow>();
    for (const notification of notifications) {
      const hazardId = notification.hazard_id;
      const eventKey = hazardId
        ? visible.find((event) => event.hazard_ids.includes(hazardId))?.id
        : visible.find(
            (event) => event.announcement_id === notification.announcement_id,
          )?.id;
      if (!eventKey) continue;
      const existing = notificationByEvent.get(eventKey);
      if (
        !existing ||
        Date.parse(notification.created_at) > Date.parse(existing.created_at)
      ) {
        notificationByEvent.set(eventKey, notification);
      }
    }

    const notifiedEvents = visible.flatMap((event) => {
      const notification = notificationByEvent.get(event.id);
      if (
        event.item_type === 'weather_event' &&
        event.hazard_ids.length === 0 &&
        event.source_type === 'weather_auto'
      ) {
        return [
          {
            ...event,
            id: event.id,
            user_id: userId,
            announcement_id: null,
            hazard_id: null,
            status: 'Sent',
            kind: 'weather',
            created_at: event.published_at,
            read_at: null,
            deleted_at: null,
            body: event.content,
            hazard: {
              hazard_type: event.category,
              risk_level: event.severity,
              ai_summary: event.ai_summary,
              safety_tips: event.safety_tips,
              source_type: event.source_type,
              source_name: event.source_name,
              city: event.city,
              province: event.province,
              observed_at: event.observed_at,
              measurements: event.measurements,
            },
            announcement: null,
          },
        ];
      }
      if (!notification) return [];
      return [
        {
          ...event,
          id: notification.id,
          user_id: userId,
          announcement_id: event.announcement_id,
          hazard_id: notification.hazard_id ?? event.hazard_id,
          status: notification.status,
          kind: event.item_type === 'pagasa' ? 'weather' : 'weather_hazard',
          created_at: notification.created_at,
          read_at:
            notification.status === 'Read' ? notification.created_at : null,
          deleted_at: null,
          body: event.content,
          hazard:
            event.item_type === 'hazard'
              ? {
                  hazard_type: event.category,
                  risk_level: event.severity,
                  ai_summary: event.ai_summary,
                  safety_tips: event.safety_tips,
                  source_type: event.source_type,
                  source_name: event.source_name,
                  city: event.city,
                  province: event.province,
                  observed_at: event.observed_at,
                  measurements: event.measurements,
                }
              : null,
          announcement: null,
        },
      ];
    });
    const start = page * limit;
    const items = notifiedEvents.slice(start, start + limit);
    return {
      alerts: items,
      page,
      limit,
      has_more: notifiedEvents.length > start + limit,
    };
  }

  private async loadEvents(
    includeStoredAnnouncements = false,
  ): Promise<FeedEvent[]> {
    const announcementsRequest = includeStoredAnnouncements
      ? this.supabase
          .from('announcements')
          .select(
            'id,title,content,ai_summary,source,source_name,source_url,published_at,category,ai_scope,source_type,city,pagasa_alert_id',
          )
          .eq('status', 'published')
          .or('ai_scope.is.null,ai_scope.eq.weather')
          .order('published_at', { ascending: false })
          .limit(EVENT_PAGE_LIMIT)
          .overrideTypes<AnnouncementRow[], { merge: false }>()
      : Promise.resolve({
          data: [] as AnnouncementRow[],
          error: null,
        });
    const [
      hazardsResult,
      locations,
      pagasaResult,
      weatherEventsResult,
      announcementsResult,
    ] = await Promise.all([
      this.supabase
        .from('hazards')
        .select(
          'id,category,event_type,hazard_type,severity,risk_level,title,description,ai_summary,safety_tips,source_type,source_name,source_url,area_key,dedupe_key,measurements,observed_at,detected_at,created_at,resolved_at,expires_at,location_id,city,province,latitude:location_lat,longitude:location_lon',
        )
        .order('created_at', { ascending: false })
        .limit(EVENT_PAGE_LIMIT),
      this.getAllLocations(),
      this.supabase
        .from('pagasa_alerts')
        .select(
          'id,event,content,severity,alert_status,published_at,expires,affected_areas,area_review_status,notification_announcement_id',
        )
        .order('published_at', { ascending: false })
        .limit(EVENT_PAGE_LIMIT),
      this.supabase
        .from('weather_alert_events')
        .select(
          'id,alert_type,city,province,area_key,severity,measurement,measured_at,sustained_since,title,ai_summary,safety,source,source_name,source_url,status,resolved_at,notified_count',
        )
        .order('measured_at', { ascending: false })
        .limit(EVENT_PAGE_LIMIT)
        .overrideTypes<WeatherAlertEventRow[], { merge: false }>(),
      announcementsRequest,
    ]);
    if (hazardsResult.error) {
      throw new ServiceUnavailableException(
        `Hazards could not be loaded: ${hazardsResult.error.message}`,
      );
    }
    if (pagasaResult.error) {
      throw new ServiceUnavailableException(
        `PAGASA alerts could not be loaded: ${pagasaResult.error.message}`,
      );
    }
    if (weatherEventsResult.error) {
      throw new ServiceUnavailableException(
        `Weather alert events could not be loaded: ${weatherEventsResult.error.message}`,
      );
    }
    if (includeStoredAnnouncements && announcementsResult.error) {
      throw new ServiceUnavailableException(
        `Weather announcements could not be loaded: ${announcementsResult.error.message}`,
      );
    }
    const hazardRows = (hazardsResult.data ?? []) as HazardRow[];
    const pagasaRows = (pagasaResult.data ?? []) as PagasaRow[];
    const weatherEventRows = weatherEventsResult.data ?? [];
    const announcementRows = announcementsResult.data ?? [];
    const locationById = new Map(
      locations.map((location) => [location.loc_id, location]),
    );
    const hazardEvents = dedupeHazards(
      hazardRows
        .filter((hazard) => !isTestHazard(hazard))
        .map((hazard) => this.toHazardEvent(hazard, locationById, locations))
        .filter((event): event is FeedEvent => event !== null),
    );
    const hazardIds = [
      ...new Set(hazardEvents.flatMap((event) => event.hazard_ids)),
    ];
    const hazardNotifications = await this.getNotifications(hazardIds, []);
    applyCounts(hazardEvents, hazardNotifications);

    const dedicatedEvents = weatherEventRows.map((event) =>
      this.toWeatherAlertEvent(event),
    );

    const linkedAnnouncementIds = new Set(
      pagasaRows
        .map((alert) => alert.notification_announcement_id)
        .filter((id): id is number => id !== null),
    );
    const pagasaAlertIds = new Set(pagasaRows.map((alert) => alert.id));
    const weatherAnnouncementRows = announcementRows.filter(
      (announcement) =>
        !['admin_manual', 'admin_test_replay', 'admin_system'].includes(
          announcement.source ?? '',
        ) &&
        !linkedAnnouncementIds.has(announcement.id) &&
        (announcement.pagasa_alert_id === null ||
          !pagasaAlertIds.has(announcement.pagasa_alert_id)),
    );
    const pagasaIds = pagasaRows
      .map((alert) => alert.notification_announcement_id)
      .filter((id): id is number => id !== null);
    const announcementIds = [
      ...new Set([
        ...pagasaIds,
        ...weatherAnnouncementRows.map((announcement) => announcement.id),
      ]),
    ];
    const announcementNotifications = await this.getNotifications(
      [],
      announcementIds,
    );
    const announcementCounts = countAnnouncementNotifications(
      announcementNotifications,
    );
    const pagasaEvents = dedupePagasaEvents(
      pagasaRows.map((alert) =>
        this.toPagasaEvent(alert, locations, announcementCounts),
      ),
    );
    const weatherAnnouncements = weatherAnnouncementRows
      .filter(
        (announcement) =>
          !isDuplicatePagasaAnnouncement(announcement, pagasaEvents),
      )
      .map((announcement) =>
        this.toAnnouncementEvent(
          announcement,
          announcementCounts.get(announcement.id) ?? {},
        ),
      )
      .filter((event): event is FeedEvent => event !== null);
    return [
      ...hazardEvents,
      ...dedicatedEvents,
      ...pagasaEvents,
      ...weatherAnnouncements,
    ].sort(
      (left, right) =>
        Date.parse(right.published_at) - Date.parse(left.published_at),
    );
  }

  private toAnnouncementEvent(
    announcement: AnnouncementRow,
    notificationCounts: Record<string, number>,
  ): FeedEvent | null {
    const source = announcement.source?.trim().toLocaleLowerCase() ?? '';
    const sourceType =
      announcement.source_type?.trim().toLocaleLowerCase() ??
      (source.includes('pagasa') ? 'pagasa' : source);
    const classification = classifyWeatherAnnouncement({
      eventType: announcement.ai_scope,
      hazardType: announcement.title,
      category: announcement.category,
      sourceType,
    });
    if (!classification) return null;

    const title = announcement.title?.trim() || 'Weather announcement';
    const content =
      announcement.ai_summary?.trim() || announcement.content?.trim() || title;
    const sourceName =
      sourceType === 'pagasa' &&
      announcement.source_name?.trim().toLocaleLowerCase() === 'unknown source'
        ? 'PAGASA'
        : announcement.source_name?.trim() ||
          (sourceType === 'pagasa' ? 'PAGASA' : 'W.A.T.C.H.');
    const city = announcement.city?.trim() || null;

    return {
      id: `announcement-${announcement.id}`,
      item_type: 'announcement',
      announcement_id: announcement.id,
      hazard_id: null,
      pagasa_id: null,
      title,
      content,
      ai_summary: content,
      source_name: sourceName,
      source_url: announcement.source_url,
      source_type: sourceType ?? 'announcement',
      category: classification.category,
      severity: null,
      event_type: announcement.category,
      area_key: city
        ? normalizeAreaKey({
            city,
            province: null,
            latitude: null,
            longitude: null,
          })
        : '',
      city,
      province: null,
      place_name: city ?? 'All locations',
      affected_areas: city ? [city] : [],
      requires_area_review: false,
      published_at: announcement.published_at,
      observed_at: announcement.published_at,
      measurements: null,
      notification_counts: notificationCounts,
      audience_count: Object.values(notificationCounts).reduce(
        (total, count) => total + count,
        0,
      ),
      hazard_ids: [],
      active: true,
      window_key: String(announcement.id),
      safety_tips: null,
    };
  }

  private toWeatherAlertEvent(event: WeatherAlertEventRow): FeedEvent {
    const category =
      event.alert_type === 'extreme_heat'
        ? 'Extreme Heat'
        : event.alert_type === 'unhealthy_air'
          ? 'Unhealthy Air'
          : event.alert_type === 'heavy_rain'
            ? 'Heavy Rain/Flood'
            : 'PAGASA/Weather';
    return {
      id: `weather-event-${event.id}`,
      item_type: 'weather_event',
      announcement_id: null,
      hazard_id: null,
      pagasa_id: null,
      title: event.title,
      content: event.ai_summary,
      ai_summary: event.ai_summary,
      source_name: event.source_name,
      source_url: event.source_url,
      source_type: event.source,
      category,
      severity: event.severity,
      event_type: event.alert_type,
      area_key: event.area_key,
      city: event.city,
      province: event.province,
      place_name: event.province ? `${event.city}, ${event.province}` : event.city,
      affected_areas: [event.city],
      requires_area_review: false,
      published_at: event.measured_at,
      observed_at: event.measured_at,
      measurements: event.measurement,
      notification_counts: {},
      audience_count: event.notified_count,
      hazard_ids: [],
      active: event.status === 'active',
      window_key: event.id,
      safety_tips: event.safety,
    };
  }

  private toHazardEvent(
    hazard: HazardRow,
    locationById: Map<number, LocationRow>,
    locations: LocationRow[],
  ): FeedEvent | null {
    const linkedLocation =
      hazard.location_id !== null
        ? locationById.get(Number(hazard.location_id))
        : undefined;
    const latitude = hazard.latitude ?? linkedLocation?.latitude ?? null;
    const longitude = hazard.longitude ?? linkedLocation?.longitude ?? null;
    const nearestLocation =
      !hazard.city && !linkedLocation?.city
        ? findNearestLocation(latitude, longitude, locations)
        : undefined;
    const city =
      hazard.city ?? linkedLocation?.city ?? nearestLocation?.city ?? null;
    const province =
      hazard.province ??
      linkedLocation?.province ??
      nearestLocation?.province ??
      null;
    const area = { city, province, latitude, longitude };
    const areaKey = normalizeAreaKey(area) || hazard.area_key || '';
    if (!areaKey) return null;
    const hazardType =
      hazard.hazard_type ?? hazard.category ?? 'Weather hazard';
    const classification = classifyWeatherAnnouncement({
      eventType: hazard.event_type,
      hazardType: hazard.hazard_type,
      category: hazard.category,
      sourceType: hazard.source_type,
    });
    if (!classification) return null;
    const publishedAt =
      hazard.observed_at ?? hazard.detected_at ?? hazard.created_at;
    const active =
      hazard.resolved_at === null &&
      (!hazard.expires_at || Date.parse(hazard.expires_at) > Date.now());
    const sourceType = hazard.source_type ?? 'weather_auto';
    const sourceName =
      hazard.source_name ??
      (sourceType === 'weather_auto'
        ? 'Open-Meteo weather data'
        : 'W.A.T.C.H. Weather Alert');
    const measurements = asRecord(hazard.measurements);
    const rendered = renderHazardTemplate({
      key: classification.templateKey,
      hazardType,
      severity: hazard.severity ?? hazard.risk_level ?? 'Advisory',
      place: placeName(area),
      observedAt: publishedAt,
      sourceName,
      measurements: {
        heatIndexC: numericValue(measurements.heatIndexC),
        rainMm: numericValue(measurements.rainMm),
        aqi: numericValue(measurements.aqi),
      },
    });
    const automated = sourceType === 'weather_auto';
    const title = automated ? rendered.title : (hazard.title ?? rendered.title);
    const summary = automated
      ? rendered.summary
      : (hazard.ai_summary ?? hazard.description ?? rendered.summary);
    const windowKey = eventWindowKey(hazard, active);
    return {
      id: `hazard-event:${areaKey}:${hazard.event_type ?? hazardType}:${windowKey}`,
      item_type: 'hazard',
      announcement_id: null,
      hazard_id: hazard.id,
      pagasa_id: null,
      title,
      content: summary,
      ai_summary: summary,
      source_name: sourceName,
      source_url: hazard.source_url,
      source_type: sourceType,
      category: classification.category,
      severity: hazard.severity ?? hazard.risk_level,
      event_type: hazard.event_type,
      area_key: areaKey,
      city,
      province,
      place_name: placeName(area),
      affected_areas: [placeName(area)],
      requires_area_review: false,
      published_at: publishedAt,
      observed_at: hazard.observed_at ?? hazard.detected_at,
      measurements: hazard.measurements,
      notification_counts: {},
      audience_count: 0,
      hazard_ids: [hazard.id],
      active,
      window_key: windowKey,
      safety_tips: rendered.safetyTips,
    };
  }

  private toPagasaEvent(
    alert: PagasaRow,
    locations: LocationRow[],
    counts: Map<number, Record<string, number>>,
  ): FeedEvent {
    const explicitAreas = Array.isArray(alert.affected_areas)
      ? alert.affected_areas.filter((area) => typeof area === 'string')
      : [];
    const extractedAreas = explicitAreas.length
      ? explicitAreas
      : extractAreaMentions(
          `${alert.event ?? ''} ${alert.content ?? ''}`,
          locations,
        ).map((area) => `${area.city}|${area.province ?? ''}`);
    const areaStatus = alert.area_review_status ?? 'needs_review';
    const title = alert.event ?? 'PAGASA Weather Alert';
    const content = alert.content ?? title;
    const observedAt =
      alert.published_at ?? alert.expires ?? new Date().toISOString();
    const firstArea = extractedAreas[0] ? parseArea(extractedAreas[0]) : null;
    const guidance = renderHazardTemplate({
      key: 'pagasa_weather',
      hazardType: title,
      severity: alert.severity ?? alert.alert_status ?? 'Advisory',
      place: firstArea ? placeName(firstArea) : 'your area',
      observedAt,
      sourceName: 'PAGASA',
      measurements: {},
    });
    const notificationCounts =
      counts.get(alert.notification_announcement_id ?? -1) ?? {};
    return {
      id: `pagasa-${alert.id}`,
      item_type: 'pagasa',
      announcement_id: alert.notification_announcement_id,
      hazard_id: null,
      pagasa_id: alert.id,
      title,
      content,
      ai_summary: content,
      source_name: 'PAGASA',
      source_url: null,
      source_type: 'pagasa',
      category: 'PAGASA/Weather',
      severity: alert.severity ?? alert.alert_status,
      event_type: 'PAGASA_ALERT',
      area_key: extractedAreas.map(normalizeAreaName).join('|'),
      city: extractedAreas[0] ? parseArea(extractedAreas[0]).city : null,
      province: null,
      place_name:
        extractedAreas.map(formatArea).join(', ') || 'Area needs review',
      affected_areas: extractedAreas,
      requires_area_review:
        !extractedAreas.length || areaStatus === 'needs_review',
      published_at: observedAt,
      observed_at: alert.published_at,
      measurements: null,
      notification_counts: notificationCounts,
      audience_count: Object.values(notificationCounts).reduce(
        (total, count) => total + count,
        0,
      ),
      hazard_ids: [],
      active: !alert.expires || Date.parse(alert.expires) > Date.now(),
      window_key: String(alert.id),
      safety_tips: guidance.safetyTips,
    };
  }

  private async getAllLocations() {
    const { data, error } = await this.supabase
      .from('locations')
      .select(
        'loc_id,user_id,label,full_address,city,province,latitude,longitude',
      );
    if (error) {
      throw new ServiceUnavailableException(
        `Saved locations could not be loaded: ${error.message}`,
      );
    }
    return (data ?? []) as LocationRow[];
  }

  private async getUserLocations(userId: string) {
    const [locationsResult, profileResult] = await Promise.all([
      this.supabase
        .from('locations')
        .select(
          'loc_id,user_id,label,full_address,city,province,latitude,longitude',
        )
        .eq('user_id', userId),
      this.supabase
        .from('user_info')
        .select('home_location_id')
        .eq('id', userId)
        .maybeSingle(),
    ]);
    if (locationsResult.error) {
      throw new ServiceUnavailableException(
        `Your saved locations could not be loaded: ${locationsResult.error.message}`,
      );
    }
    if (profileResult.error) {
      throw new ServiceUnavailableException(
        `Your home location could not be loaded: ${profileResult.error.message}`,
      );
    }
    const rows = [...((locationsResult.data ?? []) as LocationRow[])];
    const homeLocationId = Number(profileResult.data?.home_location_id);
    if (
      Number.isSafeInteger(homeLocationId) &&
      homeLocationId > 0 &&
      !rows.some((location) => location.loc_id === homeLocationId)
    ) {
      const { data, error } = await this.supabase
        .from('locations')
        .select(
          'loc_id,user_id,label,full_address,city,province,latitude,longitude',
        )
        .eq('loc_id', homeLocationId)
        .maybeSingle();
      if (error) {
        throw new ServiceUnavailableException(
          `Your home location could not be loaded: ${error.message}`,
        );
      }
      if (data) rows.push(data);
    }
    return dedupeLocations(rows);
  }

  private async getNotifications(
    hazardIds: string[],
    announcementIds: number[],
    userId?: string,
  ) {
    const rows: NotificationRow[] = [];
    if (hazardIds.length) {
      let query = this.supabase
        .from('notifications')
        .select(
          'id,hazard_id,announcement_id,user_id,status,created_at,deleted_at',
        );
      if (userId) {
        query = query.eq('user_id', userId).is('deleted_at', null);
      }
      const { data, error } = await query
        .in('hazard_id', hazardIds)
        .order('created_at', { ascending: false });
      if (error) {
        throw new ServiceUnavailableException(
          `Hazard delivery records could not be loaded: ${error.message}`,
        );
      }
      rows.push(...((data ?? []) as NotificationRow[]));
    }
    if (announcementIds.length) {
      let query = this.supabase
        .from('notifications')
        .select(
          'id,hazard_id,announcement_id,user_id,status,created_at,deleted_at',
        );
      if (userId) {
        query = query.eq('user_id', userId).is('deleted_at', null);
      }
      const { data, error } = await query
        .in('announcement_id', announcementIds)
        .order('created_at', { ascending: false });
      if (error) {
        throw new ServiceUnavailableException(
          `PAGASA delivery records could not be loaded: ${error.message}`,
        );
      }
      rows.push(...((data ?? []) as NotificationRow[]));
    }
    return userId
      ? rows.filter((row) => row.user_id === userId && !row.deleted_at)
      : rows;
  }
}

function isTestHazard(hazard: HazardRow) {
  return (
    /(^|:)test:/i.test(hazard.dedupe_key ?? '') ||
    /test simulation|test hazard/i.test(
      `${hazard.title ?? ''} ${hazard.source_name ?? ''}`,
    )
  );
}

function eventWindowKey(hazard: HazardRow, active: boolean) {
  if (active) return 'active';
  const timestamp = Date.parse(hazard.detected_at ?? hazard.created_at);
  return Number.isFinite(timestamp)
    ? String(Math.floor(timestamp / (6 * 60 * 60 * 1000)))
    : hazard.created_at;
}

function dedupeHazards(events: FeedEvent[]) {
  const unique = new Map<string, FeedEvent>();
  for (const event of events) {
    const key = `${event.area_key}|${event.event_type ?? event.category}|${event.window_key}`;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, event);
      continue;
    }
    const keep =
      Date.parse(event.published_at) > Date.parse(current.published_at)
        ? event
        : current;
    keep.hazard_ids = [
      ...new Set([...current.hazard_ids, ...event.hazard_ids]),
    ];
    unique.set(key, keep);
  }
  return [...unique.values()];
}

function dedupePagasaEvents(events: FeedEvent[]) {
  const unique = new Map<string, FeedEvent>();
  for (const event of events) {
    const key = [
      normalizeAreaName(event.title),
      normalizeAreaName(event.content),
      event.affected_areas.map(normalizeAreaName).sort().join('|'),
    ].join('|');
    const current = unique.get(key);
    if (!current) {
      unique.set(key, event);
      continue;
    }
    if (Date.parse(event.published_at) > Date.parse(current.published_at)) {
      unique.set(key, event);
    }
  }
  return [...unique.values()];
}

function isDuplicatePagasaAnnouncement(
  announcement: AnnouncementRow,
  pagasaEvents: FeedEvent[],
) {
  const isPagasa =
    announcement.source_type?.trim().toLocaleLowerCase() === 'pagasa' ||
    announcement.source?.trim().toLocaleLowerCase().includes('pagasa') === true;
  if (!isPagasa) return false;

  const title = normalizePagasaText(announcement.title);
  if (!title) return false;
  const content = normalizePagasaText(announcement.content);
  const publishedAt = Date.parse(announcement.published_at);

  return pagasaEvents.some((event) => {
    if (
      event.item_type !== 'pagasa' ||
      normalizePagasaText(event.title) !== title
    ) {
      return false;
    }

    if (content && normalizePagasaText(event.content) === content) return true;
    const eventPublishedAt = Date.parse(event.published_at);
    return (
      Number.isFinite(publishedAt) &&
      Number.isFinite(eventPublishedAt) &&
      Math.abs(publishedAt - eventPublishedAt) <= 6 * 60 * 60 * 1000
    );
  });
}

function normalizePagasaText(value: string | null | undefined) {
  return (value ?? '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function applyCounts(events: FeedEvent[], notifications: NotificationRow[]) {
  const byHazardId = new Map<string, NotificationRow[]>();
  for (const notification of notifications) {
    if (!notification.hazard_id) continue;
    const rows = byHazardId.get(notification.hazard_id) ?? [];
    rows.push(notification);
    byHazardId.set(notification.hazard_id, rows);
  }
  for (const event of events) {
    const byUser = new Map<string, NotificationRow>();
    for (const hazardId of event.hazard_ids) {
      for (const row of byHazardId.get(hazardId) ?? []) {
        const existing = byUser.get(row.user_id);
        if (
          !existing ||
          Date.parse(row.created_at) > Date.parse(existing.created_at)
        ) {
          byUser.set(row.user_id, row);
        }
      }
    }
    const statuses: Record<string, number> = {};
    for (const row of byUser.values()) {
      statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    }
    event.notification_counts = statuses;
    event.audience_count = byUser.size;
  }
}

function countAnnouncementNotifications(rows: NotificationRow[]) {
  const result = new Map<number, Record<string, number>>();
  for (const row of rows) {
    if (row.announcement_id === null) continue;
    const counts = result.get(row.announcement_id) ?? {};
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    result.set(row.announcement_id, counts);
  }
  return result;
}

function dedupeLocations(locations: LocationRow[]) {
  const unique = new Map<number, LocationRow>();
  for (const location of locations) unique.set(location.loc_id, location);
  return [...unique.values()];
}

function parseArea(value: string): HazardAreaLocation {
  const [city, province] = value.split('|', 2);
  return {
    city: city?.trim() || null,
    province: province?.trim() || null,
    latitude: null,
    longitude: null,
  };
}

function formatArea(value: string) {
  const area = parseArea(value);
  return [area.city, area.province].filter(Boolean).join(', ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function findNearestLocation(
  latitude: number | null,
  longitude: number | null,
  locations: LocationRow[],
) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
  const nearest = locations
    .filter(
      (location) =>
        typeof location.latitude === 'number' &&
        typeof location.longitude === 'number' &&
        Boolean(location.city),
    )
    .map((location) => ({
      location,
      distance: distanceKm(
        latitude,
        longitude,
        location.latitude!,
        location.longitude!,
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= 25 ? nearest.location : undefined;
}
