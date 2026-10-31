import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { MapService, MapSuggestion } from '../map/map.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';

export interface InstitutionRecord {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  facebook_page_url: string | null;
  facebook_page_id: string | null;
  is_verified: boolean;
  external_id?: string | null;
  external_source?: string | null;
}

export interface InstitutionSearchResult extends InstitutionRecord {
  result_type: 'verified' | 'suggested';
  external_id?: string | null;
  external_source?: string | null;
}

export interface InstitutionImportInput {
  external_id: string;
  external_source: string;
  name: string;
  city?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
}

const INSTITUTION_FIELDS =
  'id, name, short_name, city, province, latitude, longitude, website_url, facebook_page_url, facebook_page_id, is_verified';

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

interface InstitutionDatabaseError {
  message: string;
  code?: string;
}

function readQueryResult<T>(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    throw new InternalServerErrorException(
      'The institution database returned an invalid response.',
    );
  }
  const result = value as Record<string, unknown>;
  let error: InstitutionDatabaseError | null = null;
  if (result.error !== null && result.error !== undefined) {
    if (
      typeof result.error !== 'object' ||
      !('message' in result.error) ||
      typeof result.error.message !== 'string'
    ) {
      throw new InternalServerErrorException(
        'The institution database returned an invalid error.',
      );
    }
    error = {
      message: result.error.message,
      ...('code' in result.error && typeof result.error.code === 'string'
        ? { code: result.error.code }
        : {}),
    };
  }
  return { data: result.data as T | null, error };
}

export function mergeInstitutionResults(
  existing: InstitutionRecord[],
  suggestions: MapSuggestion[],
): InstitutionSearchResult[] {
  const seenNames = new Set(
    existing.map(
      (item) => `${normalized(item.name)}\u0000${normalized(item.city)}`,
    ),
  );
  const seenExternalIds = new Set(
    existing.flatMap((item) =>
      item.external_id && item.external_source
        ? [`${item.external_source}\u0000${item.external_id}`]
        : [],
    ),
  );

  const verified = existing.map((item) => ({
    ...item,
    result_type: 'verified' as const,
  }));
  const suggested = suggestions.flatMap((item) => {
    if (!item.external_id || !item.external_source) return [];
    const nameKey = `${normalized(item.name)}\u0000${normalized(item.city)}`;
    const externalKey = `${item.external_source}\u0000${item.external_id}`;
    if (seenNames.has(nameKey) || seenExternalIds.has(externalKey)) return [];
    seenNames.add(nameKey);
    seenExternalIds.add(externalKey);
    return [
      {
        id: `suggested:${externalKey}`,
        name: item.name,
        short_name: null,
        city: item.city,
        province: item.province,
        latitude: item.latitude,
        longitude: item.longitude,
        website_url: null,
        facebook_page_url: null,
        facebook_page_id: null,
        is_verified: false,
        result_type: 'suggested' as const,
        external_id: item.external_id,
        external_source: item.external_source,
      },
    ];
  });

  return [...verified, ...suggested].slice(0, 20);
}

@Injectable()
export class InstitutionsService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly mapService: MapService,
  ) {}

  async search(query: string) {
    const response = await this.supabase.rpc('search_institutions', {
      p_query: query,
      p_result_limit: 20,
    });
    const { data, error } = readQueryResult<InstitutionRecord[]>(response);

    if (error) {
      throw new InternalServerErrorException(
        `Institution search failed: ${error.message}`,
      );
    }

    const existing = data ?? [];
    const suggestions =
      existing.length < 5
        ? await this.mapService.suggest(query, 'institution')
        : [];
    return mergeInstitutionResults(existing, suggestions);
  }

  async findOrCreateCustom(
    name: string,
    facebookPageUrl: string | undefined,
    userId: string,
  ) {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestException(
        'Institution name must contain at least 2 characters.',
      );
    }

    const existingResult = await this.supabase
      .from('institutions')
      .select('id')
      .ilike('name', normalizedName)
      .limit(1)
      .maybeSingle();
    const { data: existing, error: existingError } = readQueryResult<{
      id: string;
    }>(existingResult);

    if (existingError) {
      throw new InternalServerErrorException(
        `Unable to check institution: ${existingError.message}`,
      );
    }

    if (existing) return existing.id;

    const insertResult = await this.supabase
      .from('institutions')
      .insert({
        name: normalizedName,
        facebook_page_url: facebookPageUrl?.trim() || null,
        is_verified: false,
        created_by: userId,
      })
      .select('id')
      .single();
    const { data, error } = readQueryResult<{ id: string }>(insertResult);

    if (error) {
      if (error.code === '23505') {
        const duplicateResult = await this.supabase
          .from('institutions')
          .select('id')
          .ilike('name', normalizedName)
          .limit(1)
          .maybeSingle();
        const { data: duplicate, error: duplicateError } = readQueryResult<{
          id: string;
        }>(duplicateResult);
        if (!duplicateError && duplicate) return duplicate.id;
      }

      throw new InternalServerErrorException(
        `Unable to add institution: ${error.message}`,
      );
    }

    if (!data) {
      throw new InternalServerErrorException(
        'The institution was added, but no record was returned.',
      );
    }
    return data.id;
  }

  async importSuggested(input: InstitutionImportInput, userId: string) {
    const name = input.name.trim();
    const externalId = input.external_id.trim();
    const externalSource = input.external_source.trim().toLocaleLowerCase();
    if (
      name.length < 2 ||
      name.length > 200 ||
      externalSource !== 'photon' ||
      !/^(node|way|relation):\d+$/.test(externalId)
    ) {
      throw new BadRequestException('The suggested institution is invalid.');
    }

    const existingExternal = await this.findByExternalId(
      externalSource,
      externalId,
    );
    if (existingExternal) return existingExternal;

    const sameNameResult = await this.supabase
      .from('institutions')
      .select('*')
      .ilike('name', name.replace(/[\\%_]/g, '\\$&'))
      .limit(50);
    const { data: sameName, error: nameError } =
      readQueryResult<InstitutionRecord[]>(sameNameResult);
    if (nameError) {
      throw new InternalServerErrorException(
        `Unable to check institution: ${nameError.message}`,
      );
    }

    const matchingLocation = (sameName ?? []).find(
      (item: InstitutionRecord) =>
        normalized(item.name) === normalized(name) &&
        normalized(item.city) === normalized(input.city),
    );

    if (matchingLocation) {
      const updateResult = await this.supabase
        .from('institutions')
        .update({
          external_id: externalId,
          external_source: externalSource,
        })
        .eq('id', matchingLocation.id)
        .select('*')
        .single();
      const { data, error } = readQueryResult<InstitutionRecord>(updateResult);
      if (error) {
        if (error.code === '23505') {
          const duplicate = await this.findByExternalId(
            externalSource,
            externalId,
          );
          if (duplicate) return duplicate;
        }
        throw new InternalServerErrorException(
          `Unable to link suggested institution: ${error.message}`,
        );
      }
      if (!data) {
        throw new InternalServerErrorException(
          'The institution was linked, but no record was returned.',
        );
      }
      return data;
    }

    const insertResult = await this.supabase
      .from('institutions')
      .insert({
        name,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        external_id: externalId,
        external_source: externalSource,
        created_by: userId,
        is_verified: false,
      })
      .select('*')
      .single();
    const { data, error } = readQueryResult<InstitutionRecord>(insertResult);
    if (error) {
      if (error.code === '23505') {
        const duplicate = await this.findByExternalId(
          externalSource,
          externalId,
        );
        if (duplicate) return duplicate;
      }
      throw new InternalServerErrorException(
        `Unable to import suggested institution: ${error.message}`,
      );
    }
    if (!data) {
      throw new InternalServerErrorException(
        'The institution was imported, but no record was returned.',
      );
    }
    return data;
  }

  async getById(id: string) {
    const profileResult = await this.supabase
      .from('institutions')
      .select(INSTITUTION_FIELDS)
      .eq('id', id)
      .maybeSingle();
    const { data, error } = readQueryResult<InstitutionRecord>(profileResult);
    if (error) {
      throw new InternalServerErrorException(
        `Unable to load institution: ${error.message}`,
      );
    }
    return data;
  }

  async updateLinks(
    id: string,
    links: { website_url?: string | null; facebook_page_url?: string | null },
  ) {
    const updateResult = await this.supabase
      .from('institutions')
      .update({
        ...(links.website_url !== undefined
          ? { website_url: links.website_url }
          : {}),
        ...(links.facebook_page_url !== undefined
          ? { facebook_page_url: links.facebook_page_url }
          : {}),
      })
      .eq('id', id)
      .select('id, name, website_url, facebook_page_url')
      .maybeSingle();
    const { data, error } = readQueryResult<{
      id: string;
      name: string;
      website_url: string | null;
      facebook_page_url: string | null;
    }>(updateResult);
    if (error) {
      throw new InternalServerErrorException(
        `Unable to update institution links: ${error.message}`,
      );
    }
    if (!data) {
      throw new BadRequestException('The institution was not found.');
    }
    return data;
  }

  private async findByExternalId(
    externalSource: string,
    externalId: string,
  ): Promise<InstitutionRecord | null> {
    const lookupResult = await this.supabase
      .from('institutions')
      .select('*')
      .eq('external_source', externalSource)
      .eq('external_id', externalId)
      .maybeSingle();
    const { data, error } = readQueryResult<InstitutionRecord>(lookupResult);
    if (error) {
      throw new InternalServerErrorException(
        `Unable to check imported institution: ${error.message}`,
      );
    }
    return data ?? null;
  }
}
