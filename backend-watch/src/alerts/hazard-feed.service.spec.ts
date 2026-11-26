import { describe, expect, it } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HazardFeedService } from './hazard-feed.service';

type QueryResult = {
  data: unknown[];
  error: null;
};

function makeQuery(result: QueryResult) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    overrideTypes: () => builder,
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder as unknown as PromiseLike<QueryResult>;
}

function createService(tables: Record<string, QueryResult>) {
  const supabase = {
    from: (table: string) => makeQuery(tables[table]),
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
      weather_alert_events: { data: [], error: null },
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
      ]),
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
});
