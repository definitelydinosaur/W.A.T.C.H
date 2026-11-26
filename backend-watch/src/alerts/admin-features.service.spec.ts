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
});
