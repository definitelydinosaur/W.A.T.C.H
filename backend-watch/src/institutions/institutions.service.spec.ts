import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SupabaseClient } from '@supabase/supabase-js';
import { MapService, MapSuggestion } from '../map/map.service';
import {
  InstitutionRecord,
  InstitutionImportInput,
  InstitutionsService,
  mergeInstitutionResults,
} from './institutions.service';

jest.mock('../supabase/supabase.provider', () => ({
  SUPABASE_CLIENT: 'SUPABASE_CLIENT',
}));

type MockQuery = Record<string, jest.Mock> & {
  then: (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

function queryBuilder(result: unknown): MockQuery {
  const query = {} as MockQuery;
  for (const method of [
    'select',
    'returns',
    'overrideTypes',
    'eq',
    'ilike',
    'limit',
    'update',
    'insert',
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.maybeSingle = jest.fn(async () => result);
  query.single = jest.fn(async () => result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function institution(overrides: Partial<InstitutionRecord> = {}) {
  return {
    id: 'existing-id',
    name: 'Cebu State University',
    short_name: null,
    city: 'Cebu City',
    province: 'Cebu',
    latitude: 10.3,
    longitude: 123.9,
    website_url: null,
    facebook_page_url: null,
    facebook_page_id: null,
    is_verified: true,
    ...overrides,
  };
}

function suggestion(
  overrides: Partial<MapSuggestion> = {},
): MapSuggestion & InstitutionImportInput {
  const externalId = overrides.external_id ?? 'node:123';
  const externalSource = overrides.external_source ?? 'photon';
  return {
    name: 'New Cebu College',
    detail: 'Cebu City',
    address: 'New Cebu College, Cebu City, Philippines',
    latitude: 10.31,
    longitude: 123.88,
    city: 'Cebu City',
    province: 'Cebu',
    barangay: '',
    ...overrides,
    external_id: externalId,
    external_source: externalSource,
  };
}

describe('InstitutionsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('merges results and deduplicates by institution name/city and provider id', () => {
    const existing = institution();
    const results = mergeInstitutionResults(
      [existing],
      [
        suggestion({ name: 'cebu state university', city: 'cebu city' }),
        suggestion(),
        suggestion({
          name: 'Duplicate provider result',
          external_id: 'node:123',
        }),
      ],
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: existing.id,
      result_type: 'verified',
    });
    expect(results[1]).toMatchObject({
      name: 'New Cebu College',
      result_type: 'suggested',
      external_id: 'node:123',
    });
  });

  it('links a suggestion to an existing same-name, same-city row', async () => {
    const matching = institution({ name: 'New Cebu College' });
    const linked = {
      ...matching,
      external_id: 'node:123',
      external_source: 'photon',
    };
    const externalLookup = queryBuilder({ data: null, error: null });
    const nameLookup = queryBuilder({ data: [matching], error: null });
    const update = queryBuilder({ data: linked, error: null });
    const from = jest
      .fn()
      .mockReturnValueOnce(externalLookup)
      .mockReturnValueOnce(nameLookup)
      .mockReturnValueOnce(update);
    const service = new InstitutionsService(
      { from } as unknown as SupabaseClient,
      {} as MapService,
    );

    const result = await service.importSuggested(suggestion(), 'user-123');

    expect(result).toEqual(linked);
    expect(update.update).toHaveBeenCalledWith({
      external_id: 'node:123',
      external_source: 'photon',
    });
    expect(update.insert).not.toHaveBeenCalled();
  });

  it('inserts a suggestion when no matching institution exists', async () => {
    const inserted = institution({
      id: 'new-id',
      name: 'New Cebu College',
      is_verified: false,
    });
    const externalLookup = queryBuilder({ data: null, error: null });
    const nameLookup = queryBuilder({ data: [], error: null });
    const insert = queryBuilder({ data: inserted, error: null });
    const from = jest
      .fn()
      .mockReturnValueOnce(externalLookup)
      .mockReturnValueOnce(nameLookup)
      .mockReturnValueOnce(insert);
    const service = new InstitutionsService(
      { from } as unknown as SupabaseClient,
      {} as MapService,
    );

    const result = await service.importSuggested(suggestion(), 'user-123');

    expect(result).toEqual(inserted);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Cebu College',
        external_id: 'node:123',
        external_source: 'photon',
        created_by: 'user-123',
        is_verified: false,
      }),
    );
  });
});
