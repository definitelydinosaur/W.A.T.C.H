import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SupabaseClient } from '@supabase/supabase-js';
import { MapService } from './map.service';

describe('MapService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns coordinates and address parts for location suggestions', async () => {
    const response = {
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [123.8857, 10.3158] },
              properties: {
                name: 'Cebu City',
                country: 'Philippines',
                state: 'Cebu',
                city: 'Cebu City',
                suburb: 'Lahug',
                type: 'city',
                osm_key: 'place',
              },
            },
          ],
        }),
    } as Response;
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    const service = new MapService();
    const suggestions = await service.suggest('Cebu City', 'location');

    expect(suggestions).toEqual([
      {
        name: 'Cebu City',
        detail: 'Lahug',
        address: 'Cebu City, Lahug, Cebu, Philippines',
        latitude: 10.3158,
        longitude: 123.8857,
        city: 'Cebu City',
        province: 'Cebu',
        barangay: 'Lahug',
      },
    ]);
  });

  it('queries live, date-ranged, and event hazards with normalized polygons and proximity filter', async () => {
    const sampleRows = [
      {
        id: 'hz-mananga',
        map_category: 'flood',
        title: 'Mananga River Overflow',
        description: 'Severe riverine flood in Tabunok and Biasong.',
        event_type: 'FLASH_FLOOD_RISK',
        hazard_type: 'Flooding risk',
        severity: 'Extreme',
        risk_level: 'Severe',
        barangay: 'Tabunok, Biasong',
        city: 'Talisay City',
        latitude: 10.2512,
        longitude: 123.8442,
        polygon: [
          [
            { latitude: 10.26, longitude: 123.83 },
            { latitude: 10.26, longitude: 123.85 },
            { latitude: 10.24, longitude: 123.85 },
            { latitude: 10.26, longitude: 123.83 },
          ],
        ],
        path: null,
        radius_m: null,
        source_type: 'pagasa',
        source_name: 'DOST-PAGASA VISPRSD / UP NOAH',
        source_url: 'https://www.pagasa.dost.gov.ph/flood',
        incident_group: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
        started_at: '2025-11-04T02:00:00+08:00',
        resolved_at: '2025-11-06T14:00:00+08:00',
        safety_tips: {
          do: ['Evacuate to higher ground.'],
          prepare: ['Prepare go-bag.'],
          avoid: ['Do not cross rivers.'],
        },
      },
      {
        id: 'hz-danao',
        map_category: 'flood',
        title: 'Danao River Surge',
        description: 'Danao flood zone.',
        event_type: 'FLASH_FLOOD_RISK',
        hazard_type: 'Flooding risk',
        severity: 'Warning',
        risk_level: 'Warning',
        barangay: 'Suba',
        city: 'Danao City',
        latitude: 10.5228,
        longitude: 124.0252,
        polygon: null,
        path: null,
        radius_m: 400,
        source_type: 'pagasa',
        source_name: 'DOST-PAGASA VISPRSD',
        source_url: null,
        incident_group: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
        started_at: '2025-11-04T03:00:00+08:00',
        resolved_at: '2025-11-06T12:00:00+08:00',
        safety_tips: ['Avoid coastal roads.'],
      },
    ];

    const rpcMock = jest
      .fn<(...args: unknown[]) => Promise<{ data: unknown; error: null }>>()
      .mockResolvedValue({ data: sampleRows, error: null });

    const eqMock = jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest
          .fn<() => Promise<{ data: unknown; error: null }>>()
          .mockResolvedValue({ data: sampleRows, error: null }),
      }),
    });
    const notMock = jest.fn().mockReturnValue({
      eq: eqMock,
      is: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest
            .fn<() => Promise<{ data: unknown; error: null }>>()
            .mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const supabaseStub = {
      rpc: rpcMock,
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          not: notMock,
        }),
      }),
    } as unknown as SupabaseClient;

    const service = new MapService(supabaseStub);

    // Date query passes Asia/Manila boundaries to get_map_hazards_by_range
    const dateResult = await service.getMapHazards({
      mode: 'date',
      date: '2025-11-04',
      lat: 10.2512,
      lon: 123.8442,
      radiusKm: 10,
    });

    expect(rpcMock).toHaveBeenCalledWith('get_map_hazards_by_range', {
      p_start: '2025-11-04T00:00:00+08:00',
      p_end: '2025-11-04T23:59:59.999+08:00',
      p_include_active: true,
      p_city: null,
    });
    expect(dateResult.hazards).toHaveLength(1);
    expect(dateResult.hazards[0]).toMatchObject({
      id: 'hz-mananga',
      type: 'flood',
      severity: 'Extreme',
      city: 'Talisay City',
      sourceName: 'DOST-PAGASA VISPRSD / UP NOAH',
      incidentGroup: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
      status: 'resolved',
    });
    expect(dateResult.hazards[0].polygon).toHaveLength(1);

    // Event query returns all hazards for that incident_group sorted by severity
    const eventResult = await service.getMapHazards({
      mode: 'event',
      incidentGroup: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
    });
    expect(eventResult.hazards).toHaveLength(2);
    expect(eventResult.hazards[0].id).toBe('hz-mananga');
    expect(eventResult.hazards[1].safetyTips).toEqual({
      do: ['Avoid coastal roads.'],
      prepare: [],
      avoid: [],
    });
  });

  it('builds 30-day history index and major historical events with bounding boxes', async () => {
    const nowIso = new Date().toISOString();
    const recentRows = [
      {
        id: 'live-1',
        map_category: 'closure',
        title: 'Busay Closure',
        description: 'Landslide along Busay switchbacks.',
        severity: 'Severe',
        city: 'Cebu City',
        latitude: 10.3431,
        longitude: 123.8771,
        polygon: null,
        path: [
          { latitude: 10.335, longitude: 123.88 },
          { latitude: 10.348, longitude: 123.875 },
        ],
        source_type: 'lgu_official',
        source_name: 'DPWH Region VII',
        incident_group: null,
        started_at: nowIso,
        resolved_at: null,
      },
    ];
    const eventRows = [
      {
        id: 'ev-1',
        map_category: 'flood',
        title: 'Mananga Flood',
        description: 'Flooding in Talisay.',
        severity: 'Extreme',
        city: 'Talisay City',
        latitude: 10.2512,
        longitude: 123.8442,
        polygon: [
          [
            { latitude: 10.2785, longitude: 123.8278 },
            { latitude: 10.2408, longitude: 123.8588 },
            { latitude: 10.2368, longitude: 123.8548 },
            { latitude: 10.2785, longitude: 123.8278 },
          ],
        ],
        path: null,
        source_type: 'pagasa',
        source_name: 'DOST-PAGASA VISPRSD / UP NOAH',
        incident_group: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
        started_at: '2025-11-04T02:00:00+08:00',
        resolved_at: '2025-11-06T14:00:00+08:00',
      },
    ];

    let call = 0;
    const supabaseStub = {
      from: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          not: jest.fn().mockImplementation(() => {
            call += 1;
            if (call === 1) {
              return {
                or: jest.fn().mockReturnValue({
                  limit: jest
                    .fn<() => Promise<{ data: unknown; error: null }>>()
                    .mockResolvedValue({ data: recentRows, error: null }),
                }),
              };
            }
            return {
              not: jest.fn().mockReturnValue({
                limit: jest
                  .fn<() => Promise<{ data: unknown; error: null }>>()
                  .mockResolvedValue({ data: eventRows, error: null }),
              }),
            };
          }),
        }),
      })),
    } as unknown as SupabaseClient;

    const service = new MapService(supabaseStub);
    const index = await service.getHistoryIndex();

    expect(index.liveCount).toBe(1);
    expect(index.days).toHaveLength(30);
    expect(index.days[0].count).toBe(1);
    expect(index.days[0].peakSeverity).toBe('Severe');
    expect(index.events).toHaveLength(1);
    expect(index.events[0]).toMatchObject({
      incidentGroup: 'Typhoon Kalmaegi - Nov 2025 Cebu Floods',
      hazardCount: 1,
      peakSeverity: 'Extreme',
      cities: ['Talisay City'],
      bounds: {
        minLat: 10.2368,
        maxLat: 10.2785,
        minLon: 123.8278,
        maxLon: 123.8588,
      },
    });
  });
});
