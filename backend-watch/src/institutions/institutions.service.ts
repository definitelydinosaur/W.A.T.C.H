import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';

@Injectable()
export class InstitutionsService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async search(query: string) {
    const { data, error } = await this.supabase
      .from('institutions')
      .select(
        'id, name, short_name, city, province, latitude, longitude, website_url, facebook_page_url, facebook_page_id, is_verified',
      )
      .ilike('name', `%${query}%`)
      .order('is_verified', { ascending: false })
      .order('name')
      .limit(20);

    if (error) {
      throw new InternalServerErrorException(
        `Institution search failed: ${error.message}`,
      );
    }

    return data;
  }

  async findOrCreateCustom(name: string, facebookPageUrl?: string) {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestException(
        'Institution name must contain at least 2 characters.',
      );
    }

    const { data: existing, error: existingError } = await this.supabase
      .from('institutions')
      .select('id')
      .ilike('name', normalizedName)
      .maybeSingle();

    if (existingError) {
      throw new InternalServerErrorException(
        `Unable to check institution: ${existingError.message}`,
      );
    }

    if (existing) return existing.id as string;

    const { data, error } = await this.supabase
      .from('institutions')
      .insert({
        name: normalizedName,
        facebook_page_url: facebookPageUrl?.trim() || null,
        is_verified: false,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: duplicate, error: duplicateError } = await this.supabase
          .from('institutions')
          .select('id')
          .ilike('name', normalizedName)
          .maybeSingle();
        if (!duplicateError && duplicate) return duplicate.id as string;
      }

      throw new InternalServerErrorException(
        `Unable to add institution: ${error.message}`,
      );
    }

    return data.id as string;
  }
}
