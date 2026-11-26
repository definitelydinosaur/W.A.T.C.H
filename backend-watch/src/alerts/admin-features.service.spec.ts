import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminFeaturesService } from './admin-features.service';

jest.mock('expo-server-sdk', () => ({ Expo: class Expo {} }));

type QueryResult = {
  data: unknown[];
  error: null;
};

function createService(result: QueryResult, calls: string[]) {
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      calls.push(`${column}=${value}`);
      return builder;
    },
    order: () => builder,
    range: (start: number, end: number) => {
      calls.push(`range=${start},${end}`);
      return builder;
    },
    overrideTypes: () => builder,
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  const supabase = { from: () => builder };
  return new AdminFeaturesService(
    supabase as unknown as SupabaseClient,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('AdminFeaturesService manual announcement history', () => {
  it('returns published manual items with a lookahead page indicator', async () => {
    const calls: string[] = [];
    const rows = [
      {
        id: 8,
        title: 'Recent manual alert',
        content: 'Alert details',
        source_name: 'W.A.T.C.H. Admin',
        published_at: '2026-11-26T12:00:00.000Z',
        category: 'local',
        ai_scope: 'local',
      },
      {
        id: 7,
        title: 'Older manual alert',
        content: 'Older details',
        source_name: 'W.A.T.C.H. Admin',
        published_at: '2026-11-25T12:00:00.000Z',
        category: 'weather',
        ai_scope: 'weather',
      },
    ];
    const service = createService({ data: rows, error: null }, calls);

    const result = await service.getManualAnnouncementHistory('1', '1');

    expect(result).toEqual({
      items: [rows[0]],
      page: 1,
      limit: 1,
      has_more: true,
    });
    expect(calls).toEqual([
      'source=admin_manual',
      'status=published',
      'range=1,2',
    ]);
  });

  it('sends default weather-template guidance to all users', async () => {
    const insertedAnnouncements: Record<string, unknown>[] = [];
    const supabase = {
      from: (table: string) => {
        let rangeStart = 0;
        const query = {
          insert: (row: Record<string, unknown>) => {
            if (table === 'announcements') insertedAnnouncements.push(row);
            return query;
          },
          select: () => query,
          single: () => query,
          order: () => query,
          range: (start: number) => {
            rangeStart = start;
            return query;
          },
          overrideTypes: () => query,
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => {
            const result =
              table === 'announcements'
                ? { data: { id: 21 }, error: null }
                : {
                    data:
                      rangeStart === 0
                        ? [{ id: 'user-1' }, { id: 'user-2' }]
                        : [],
                    error: null,
                  };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
        return query;
      },
    };
    const sentNotifications: Record<string, unknown>[] = [];
    const sendUserNotification = async (
      notification: Record<string, unknown>,
    ) => {
      sentNotifications.push(notification);
      return { sent: true, duplicate: false };
    };
    const service = new AdminFeaturesService(
      supabase as unknown as SupabaseClient,
      {} as never,
      { sendUserNotification } as never,
      {} as never,
    );

    const result = await service.sendDefaultAnnouncementTemplateToAllUsers(
      'extreme_heat',
      'admin-1',
    );

    expect(result).toMatchObject({
      sent: 2,
      failed: 0,
      no_token: 0,
      audience_count: 2,
    });
    expect(insertedAnnouncements[0]).toMatchObject({
      title: 'Extreme Heat Safety Guide',
      ai_scope: 'weather',
      ai_key_points: expect.arrayContaining([
        expect.stringContaining('Do:'),
        expect.stringContaining('Avoid:'),
        expect.stringContaining('Prepare:'),
      ]),
    });
    expect(sentNotifications).toHaveLength(2);
    expect(sentNotifications[0]).toEqual(
      expect.objectContaining({
        title: 'Extreme Heat Safety Guide',
        kind: 'weather',
        announcementId: '21',
        body: expect.stringContaining('What to prepare:'),
        ignorePreferences: true,
      }),
    );
  });
});
