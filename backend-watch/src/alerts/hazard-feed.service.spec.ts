import { describe, expect, it } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HazardFeedService } from './hazard-feed.service';

type QueryResult = {
  data: unknown[];
  error: null;
};

function makeQuery(result: QueryResult, table: string) {
  let data = result.data;
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    or: (filter: string) => {
      if (table === 'announcements' && filter.startsWith('ai_scope.is.null,')) {
        const clauses = filter.split(',');
        data = data.filter((value) => {
          const scope = (value as { ai_scope?: string | null }).ai_scope;
          return clauses.some((clause) => {
            if (clause === 'ai_scope.is.null') return scope == null;
            if (clause === 'ai_scope.neq.system') {
              return scope != null && scope !== 'system';
            }
            if (clause === 'ai_scope.eq.weather') return scope === 'weather';
            return false;
          });
        });
      }
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    overrideTypes: () => builder,
    maybeSingle: () =>
      Promise.resolve({ data: result.data[0] ?? null, error: result.error }),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ ...result, data }).then(resolve, reject),
  };
  return builder as unknown as PromiseLike<QueryResult>;
}

function createService(tables: Record<string, QueryResult>) {
  const supabase = {
    from: (table: string) => makeQuery(tables[table], table),
  };
  return new HazardFeedService(supabase as unknown as SupabaseClient);
}

describe('HazardFeedService admin weather feed', () => {
  it('includes classified hazards and legacy weather announcements', async () => {
    const service = createService({
      hazards: {
        data: [
          {
            id: 'hazard-1',
            category: 'Extreme Heat',
            event_type: 'EXTREME_HEAT_INDEX',
            hazard_type: 'Extreme heat',
            severity: 'Warning',
            risk_level: 'Warning',
            title: 'Extreme heat',
            description: 'High heat index',
            ai_summary: 'Extreme heat alert',
            safety_tips: {},
            source_type: 'weather_auto',
            source_name: 'Open-Meteo weather data',
            source_url: null,
            area_key: 'manila|metro manila',
            dedupe_key: null,
            measurements: {},
            observed_at: '2026-11-26T12:00:00.000Z',
            detected_at: '2026-11-26T12:00:00.000Z',
            created_at: '2026-11-26T12:00:00.000Z',
            resolved_at: null,
            expires_at: null,
            location_id: null,
            city: 'Manila',
            province: 'Metro Manila',
            latitude: null,
            longitude: null,
          },
        ],
        error: null,
      },
      locations: { data: [], error: null },
      pagasa_alerts: { data: [], error: null },
      weather_alert_events: {
        data: [
          {
            id: 'event-1',
            alert_type: 'unhealthy_air',
            city: 'Manila',
            province: 'Metro Manila',
            area_key: 'manila|metro manila',
            severity: 'Advisory',
            measurement: { aqi: 110 },
            measured_at: '2026-11-26T14:00:00.000Z',
            sustained_since: '2026-11-26T13:00:00.000Z',
            title: 'Unhealthy Air Warning in Manila',
            ai_summary: 'Air quality is unhealthy.',
            safety: {},
            source: 'weather_auto',
            source_name: 'Detected by W.A.T.C.H. from weather data',
            source_url: null,
            status: 'active',
            resolved_at: null,
            notified_count: 1,
          },
        ],
        error: null,
      },
      announcements: {
        data: [
          {
            id: 12,
            title: 'General Flood Advisory (Final)',
            content: 'Flood advisory details',
            ai_summary: 'Flood advisory details',
            source: 'pagasa',
            source_name: 'Unknown Source',
            source_url: null,
            published_at: '2026-11-26T13:00:00.000Z',
            category: 'weather',
            ai_scope: 'weather',
            source_type: 'pagasa',
            city: null,
            pagasa_alert_id: null,
          },
          {
            id: 13,
            title: 'Heavy Rain Advisory',
            content: 'Heavy rainfall is expected.',
            ai_summary: 'Heavy rainfall is expected.',
            source: 'local_weather',
            source_name: 'Local Weather Feed',
            source_url: null,
            published_at: '2026-11-26T12:30:00.000Z',
            category: 'local',
            ai_scope: 'local',
            source_type: 'weather_auto',
            city: null,
            pagasa_alert_id: null,
          },
          {
            id: 14,
            title: 'Unhealthy Air Warning in Manila',
            content: 'Air quality is unhealthy.',
            ai_summary: 'Air quality is unhealthy.',
            source: 'weather_auto',
            source_name: 'Detected by W.A.T.C.H. from weather data',
            source_url: null,
            external_post_id: 'weather-event:event-1',
            published_at: '2026-11-26T14:00:00.000Z',
            category: 'unhealthy_air',
            ai_scope: 'weather',
            source_type: 'weather_auto',
            city: 'Manila',
            pagasa_alert_id: null,
          },
        ],
        error: null,
      },
      notifications: { data: [], error: null },
    });

    const result = await service.getAdminEvents({});

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_type: 'hazard',
          category: 'Extreme Heat',
        }),
        expect.objectContaining({
          item_type: 'announcement',
          announcement_id: 12,
          source_name: 'PAGASA',
        }),
        expect.objectContaining({
          item_type: 'announcement',
          announcement_id: 13,
          category: 'Heavy Rain/Flood',
        }),
        expect.objectContaining({
          item_type: 'weather_event',
          announcement_id: 14,
          category: 'Unhealthy Air',
        }),
      ]),
    );
    expect(result.items.some((item) => item.id === 'announcement-14')).toBe(
      false,
    );
  });

  it('does not list a legacy PAGASA announcement already in the PAGASA feed', async () => {
    const service = createService({
      hazards: { data: [], error: null },
      locations: { data: [], error: null },
      pagasa_alerts: {
        data: [
          {
            id: 8,
            event: 'General Flood Advisory (Final)',
            content: 'Flood advisory details',
            severity: 'Advisory',
            alert_status: 'active',
            published_at: '2026-11-15T05:06:59.538Z',
            expires: null,
            affected_areas: [],
            area_review_status: 'needs_review',
            notification_announcement_id: null,
          },
        ],
        error: null,
      },
      weather_alert_events: { data: [], error: null },
      announcements: {
        data: [
          {
            id: 6,
            title: 'General Flood Advisory (Final)',
            content: 'Flood advisory details',
            ai_summary: 'Flood advisory details',
            source: 'PAGASA',
            source_name: 'Unknown Source',
            source_url: null,
            published_at: '2026-11-15T05:06:59.538Z',
            category: 'hazard',
            ai_scope: null,
            source_type: null,
            city: null,
            pagasa_alert_id: null,
          },
        ],
        error: null,
      },
      notifications: { data: [], error: null },
    });

    const result = await service.getAdminEvents({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        item_type: 'pagasa',
        title: 'General Flood Advisory (Final)',
        source_name: 'PAGASA',
      }),
    );
  });

  it('links delivered generated weather alerts to user notifications', async () => {
    const userId = 'user-1';
    const service = createService({
      hazards: { data: [], error: null },
      locations: {
        data: [
          {
            loc_id: 1,
            user_id: userId,
            label: null,
            full_address: null,
            city: 'Manila',
            province: 'Metro Manila',
            latitude: null,
            longitude: null,
          },
        ],
        error: null,
      },
      user_info: { data: [], error: null },
      pagasa_alerts: { data: [], error: null },
      weather_alert_events: {
        data: [
          {
            id: 'event-1',
            alert_type: 'unhealthy_air',
            city: 'Manila',
            province: 'Metro Manila',
            area_key: 'manila|metro manila',
            severity: 'Advisory',
            measurement: { aqi: 110 },
            measured_at: '2026-11-26T14:00:00.000Z',
            sustained_since: '2026-11-26T13:00:00.000Z',
            title: 'Unhealthy Air Warning in Manila',
            ai_summary: 'Air quality is unhealthy.',
            safety: {},
            source: 'weather_auto',
            source_name: 'Detected by W.A.T.C.H. from weather data',
            source_url: null,
            status: 'active',
            resolved_at: null,
            notified_count: 1,
          },
        ],
        error: null,
      },
      announcements: {
        data: [
          {
            id: 14,
            title: 'Unhealthy Air Warning in Manila',
            content: 'Air quality is unhealthy.',
            ai_summary: 'Air quality is unhealthy.',
            source: 'weather_auto',
            source_name: 'Detected by W.A.T.C.H. from weather data',
            source_url: null,
            external_post_id: 'weather-event:event-1',
            published_at: '2026-11-26T14:00:00.000Z',
            category: 'unhealthy_air',
            ai_scope: 'weather',
            source_type: 'weather_auto',
            city: 'Manila',
            pagasa_alert_id: null,
          },
        ],
        error: null,
      },
      notifications: {
        data: [
          {
            id: 'notification-1',
            hazard_id: null,
            announcement_id: 14,
            user_id: userId,
            status: 'Unread',
            created_at: '2026-11-26T14:00:01.000Z',
            deleted_at: null,
          },
        ],
        error: null,
      },
    });

    const result = await service.getUserEvents(userId);

    expect(result.alerts).toEqual([
      expect.objectContaining({
        id: 'notification-1',
        item_type: 'weather_event',
        announcement_id: 14,
        status: 'Unread',
      }),
    ]);
  });
});
