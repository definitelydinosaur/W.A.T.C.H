import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { AiService } from '../ai/ai.service';
import { matchCebuBasins, selectBasinPolygons } from './cebu-basins';
import {
  HazardIngestionService,
  parsePagasaBulletins,
} from './hazard-ingestion.service';
import { MapService } from './map.service';

describe('cebu-basins spatial matching', () => {
  it('matches specific Cebu rivers and barangays from advisory text', () => {
    const matched = matchCebuBasins(
      'Overflow reported along Mananga River in Tabunok and Subangdaku near Mahiga Creek.',
    );
    const ids = matched.map((b) => b.id);
    expect(ids).toContain('mananga-river');
    expect(ids).toContain('mahiga-creek');
    expect(ids).not.toContain('danao-river');
  });

  it('selects 100yr polygons for Extreme and 5yr polygons for Warning', () => {
    const [mananga] = matchCebuBasins('Mananga River');
    const extremePolys = selectBasinPolygons(mananga, 'Extreme');
    const warningPolys = selectBasinPolygons(mananga, 'Warning');
    expect(extremePolys).toEqual(mananga.returnPeriods['100yr']);
    expect(warningPolys).toEqual(mananga.returnPeriods['5yr']);
  });
});

describe('HazardIngestionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses PAGASA VISPRSD bulletins and upserts UP NOAH polygons without fabricating on unreachable feeds', async () => {
    const html = `
      <div class="advisory">
        <p>Heavy Rainfall Warning No. 3 (#VISPRSD) issued 2026-11-22: Red Rainfall Warning over Cebu City and Talisay City affecting Mananga River and Guadalupe River.</p>
      </div>
    `;
    const parsed = parsePagasaBulletins(
      html,
      'https://www.pagasa.dost.gov.ph/regional-forecast/visayas',
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      severity: 'Extreme',
      mapCategory: 'flood',
      warningType: 'red-rainfall',
      isTerminated: false,
    });

    const insertedPayloads: Record<string, unknown>[] = [];
    const supabaseStub = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn<() => Promise<{ data: null; error: null }>>()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        insert: jest.fn((payload: Record<string, unknown>) => {
          insertedPayloads.push(payload);
          return {
            select: jest.fn().mockReturnValue({
              single: jest
                .fn<() => Promise<{ data: { id: string }; error: null }>>()
                .mockResolvedValue({
                  data: { id: `hz-${insertedPayloads.length}` },
                  error: null,
                }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'PAGASA_VISPRSD_URL') {
          return 'https://www.pagasa.dost.gov.ph/regional-forecast/visayas';
        }
        if (key === 'PAGASA_FLOOD_URL') {
          return 'https://www.pagasa.dost.gov.ph/flood';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    const ai = {
      extractSpatialHazard: jest
        .fn<() => Promise<null>>()
        .mockResolvedValue(null),
    } as unknown as AiService;

    const mapService = new MapService(supabaseStub);

    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/regional-forecast/visayas')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(html),
        } as Response);
      }
      return Promise.reject(new Error('Network timeout'));
    });

    const service = new HazardIngestionService(
      supabaseStub,
      config,
      ai,
      mapService,
    );
    const result = await service.pollPagasaAdvisories();

    expect(result.bulletinsFound).toBe(1);
    expect(result.upserted).toBe(2);
    expect(insertedPayloads.map((p) => p.city)).toEqual(
      expect.arrayContaining(['Talisay City', 'Cebu City']),
    );
    expect(Array.isArray(insertedPayloads[0].polygon)).toBe(true);
    expect(insertedPayloads[0].source_type).toBe('pagasa');
  });

  it('ingests official DPWH road closures with OSRM road snapping and skips non-spatial notices', async () => {
    const insertedPayloads: Record<string, unknown>[] = [];
    const supabaseStub = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn<() => Promise<{ data: null; error: null }>>()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        insert: jest.fn((payload: Record<string, unknown>) => {
          insertedPayloads.push(payload);
          return {
            select: jest.fn().mockReturnValue({
              single: jest
                .fn<() => Promise<{ data: { id: string }; error: null }>>()
                .mockResolvedValue({ data: { id: 'hz-closure-1' }, error: null }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const ai = {
      extractSpatialHazard: jest
        .fn<() => Promise<null>>()
        .mockResolvedValue(null),
    } as unknown as AiService;

    const mapService = {
      geocode: jest
        .fn<(q: string) => Promise<{ name: string; latitude: number; longitude: number }>>()
        .mockImplementation(async (query: string) =>
          query.includes('Busay')
            ? { name: 'Busay', latitude: 10.3431, longitude: 123.8771 }
            : { name: 'Balamban', latitude: 10.4334, longitude: 123.7628 },
        ),
    } as unknown as MapService;

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          routes: [
            {
              geometry: {
                coordinates: [
                  [123.8771, 10.3431],
                  [123.82, 10.39],
                  [123.7628, 10.4334],
                ],
              },
            },
          ],
        }),
    } as Response);

    const service = new HazardIngestionService(
      supabaseStub,
      config,
      ai,
      mapService,
    );

    const closureRes = await service.ingestFromOfficialAnnouncement({
      id: 42,
      source: 'DPWH Region VII',
      source_type: 'lgu',
      source_url: 'https://www.dpwh.gov.ph/advisory-42',
      title: 'Road closure along Cebu Transcentral Hwy',
      content:
        'Road closed due to landslide from Busay to Balamban. Motorists advised to take alternate routes.',
      published_at: '2026-11-22T01:00:00.000Z',
      category: 'emergency',
      ai_summary: 'Transcentral Hwy closed between Busay and Balamban.',
      affects_location: 'Busay',
      confidence: 0.92,
      city: 'Cebu City',
    });

    expect(closureRes.ingested).toBe(true);
    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({
      map_category: 'closure',
      source_type: 'lgu_official',
      external_event_id: 'announcement:42',
      path: [
        { latitude: 10.3431, longitude: 123.8771 },
        { latitude: 10.39, longitude: 123.82 },
        { latitude: 10.4334, longitude: 123.7628 },
      ],
    });

    const holidayRes = await service.ingestFromOfficialAnnouncement({
      id: 43,
      source: 'Cebu City Government',
      source_type: 'lgu',
      source_url: 'https://example.gov.ph/43',
      title: 'Charter Day Holiday Announcement',
      content: 'Classes and government work are suspended for Charter Day celebration.',
      published_at: '2026-11-22T01:00:00.000Z',
      category: 'holiday_no_class',
      ai_summary: 'Charter Day holiday.',
      affects_location: 'Cebu City',
      confidence: 0.95,
      city: 'Cebu City',
    });

    expect(holidayRes).toEqual({ ingested: false, reason: 'non-spatial' });
  });
});
