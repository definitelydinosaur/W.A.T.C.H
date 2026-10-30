import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { InstitutionsService } from '../institutions/institutions.service';
import { SaveHomeLocationDto } from './dto/save-home-location.dto';
import { LocationPromptDto } from './dto/location-prompt.dto';
import { SelectInstitutionDto } from './dto/select-institution.dto';

export interface SavedLocationRecord {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  province: string | null;
  barangay: string | null;
}

function isSavedLocationRecord(value: unknown): value is SavedLocationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.label === 'string' &&
    typeof record.address === 'string' &&
    typeof record.latitude === 'number' &&
    typeof record.longitude === 'number'
  );
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient,
    private readonly institutionsService: InstitutionsService,
  ) {}

  async uploadProfilePicture(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Profile picture is required.');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, and WEBP images are allowed.',
      );
    }

    // 1. Upload the image to Supabase Storage
    const filePath = `profile_pic/${userId}/picture.jpg`;

    const { error: uploadError } = await this.supabase.storage
      .from('watch_storage')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Image upload failed: ${uploadError.message}`,
      );
    }

    // 2. Save the storage path in the database
    const { data: updatedProfile, error: updateError } = await this.supabase
      .from('user_info')
      .update({ profile_pic: filePath })
      .eq('id', userId)
      .select('id, profile_pic')
      .maybeSingle();

    if (updateError) {
      throw new InternalServerErrorException(
        `Profile update failed: ${updateError.message}`,
      );
    }

    if (!updatedProfile) {
      throw new InternalServerErrorException(
        `Image uploaded, but no user_info row matched ID: ${userId}.`,
      );
    }

    // 3. Generate a signed URL valid for one year
    const expiresIn = 60 * 60 * 24 * 365;

    const { data: signedData, error: signedError } = await this.supabase.storage
      .from('watch_storage')
      .createSignedUrl(filePath, expiresIn);

    if (signedError) {
      throw new InternalServerErrorException(
        `Failed to generate signed URL: ${signedError.message}`,
      );
    }

    // 4. Return the signed URL for the frontend
    return {
      message: 'Profile picture updated successfully.',
      profile_pic: signedData.signedUrl,
    };
  }

  async getProfilePicture(userId: string) {
    const { data, error } = await this.supabase
      .from('user_info')
      .select('profile_pic')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch profile picture: ${error.message}`,
      );
    }

    const filePath =
      typeof data?.profile_pic === 'string' ? data.profile_pic : null;

    if (!filePath) {
      return { profile_pic: null };
    }

    const { data: signedData, error: signedError } = await this.supabase.storage
      .from('watch_storage')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedError) {
      throw new InternalServerErrorException(
        `Failed to generate signed URL: ${signedError.message}`,
      );
    }

    return {
      profile_pic: signedData.signedUrl,
    };
  }

  async updateProfile(
    userId: string,
    updates: {
      name?: string;
      birthdate?: string;
      country?: string;
    },
  ) {
    const allowedFields = ['name', 'birthdate', 'country'];
    const submittedFields = Object.keys(updates);

    if (
      submittedFields.length === 0 ||
      submittedFields.some((field) => !allowedFields.includes(field))
    ) {
      throw new BadRequestException(
        'Provide at least one valid profile field to update.',
      );
    }

    const updateData: {
      name?: string;
      birthdate?: string;
      country?: string;
    } = {};

    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
    }

    if (updates.birthdate !== undefined) {
      updateData.birthdate = updates.birthdate;
    }

    if (updates.country !== undefined) {
      updateData.country = updates.country.trim();
    }

    if (updateData.name !== undefined && updateData.name.length === 0) {
      throw new BadRequestException('Name cannot be empty.');
    }

    if (updateData.country !== undefined && updateData.country.length === 0) {
      throw new BadRequestException('Country cannot be empty.');
    }

    const { data, error } = await this.supabase
      .from('user_info')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, birthdate, country')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update profile: ${error.message}`,
      );
    }

    if (!data) {
      throw new BadRequestException(
        'No profile was found for the authenticated user.',
      );
    }

    return {
      message: 'Profile updated successfully.',
      profile: data,
    };
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_info')
      .select(
        'id, name, email, birthdate, country, home_location_id, location_prompt_dismissed_at',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch profile: ${error.message}`,
      );
    }

    if (!data) {
      throw new BadRequestException(
        'No profile was found for the authenticated user.',
      );
    }

    let homeLocation = null;
    if (data.home_location_id) {
      const { data: location, error: locationError } = await this.supabase
        .from('locations')
        .select(
          'id, label, address, latitude, longitude, city, province, barangay',
        )
        .eq('id', data.home_location_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (locationError) {
        throw new InternalServerErrorException(
          `Failed to fetch home location: ${locationError.message}`,
        );
      }
      homeLocation = location;
    }

    const { data: userInstitution, error: userInstitutionError } =
      await this.supabase
        .from('user_institutions')
        .select('institution_id')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle();

    if (userInstitutionError) {
      throw new InternalServerErrorException(
        `Failed to fetch institution link: ${userInstitutionError.message}`,
      );
    }

    let institution = null;
    if (userInstitution) {
      const { data: institutionData, error: institutionError } =
        await this.supabase
          .from('institutions')
          .select('id, name, short_name, city, province, is_verified')
          .eq('id', userInstitution.institution_id)
          .maybeSingle();

      if (institutionError) {
        throw new InternalServerErrorException(
          `Failed to fetch institution: ${institutionError.message}`,
        );
      }
      institution = institutionData;
    }

    return {
      profile: {
        ...data,
        home_location: homeLocation,
        institution,
      },
    };
  }

  async saveHomeLocation(userId: string, location: SaveHomeLocationDto) {
    const address = location.address.trim();
    if (address.length < 2) {
      throw new BadRequestException('Enter a complete home address.');
    }

    const result = await this.supabase.rpc('save_home_location', {
      p_user_id: userId,
      p_address: address,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_city: location.city?.trim() || null,
      p_province: location.province?.trim() || null,
      p_barangay: location.barangay?.trim() || null,
    });

    if (result.error) {
      throw new InternalServerErrorException(
        `Failed to save home location: ${result.error.message}`,
      );
    }

    const savedLocation: unknown = result.data;
    if (!isSavedLocationRecord(savedLocation)) {
      throw new InternalServerErrorException(
        'Home location was saved, but the database returned an invalid location record.',
      );
    }
    return { location: savedLocation };
  }

  async updateLocationPrompt(userId: string, prompt: LocationPromptDto) {
    const { data, error } = await this.supabase
      .from('user_info')
      .update({ location_prompt_dismissed_at: prompt.dismissedAt ?? null })
      .eq('id', userId)
      .select('location_prompt_dismissed_at')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update location prompt: ${error.message}`,
      );
    }
    if (!data) {
      throw new BadRequestException(
        'No profile was found for the authenticated user.',
      );
    }
    return { profile: data };
  }

  async setInstitution(userId: string, selection: SelectInstitutionDto) {
    let institutionId = selection.institutionId ?? null;
    if (!institutionId && selection.name?.trim()) {
      institutionId = await this.institutionsService.findOrCreateCustom(
        selection.name,
        selection.facebookPageUrl,
      );
    }

    if (!institutionId && selection.institutionId === undefined) {
      throw new BadRequestException(
        'Select an institution or provide a custom institution name.',
      );
    }

    let institution = null;
    if (institutionId) {
      const { data, error: institutionError } = await this.supabase
        .from('institutions')
        .select('id, name, short_name, city, province, is_verified')
        .eq('id', institutionId)
        .maybeSingle();

      if (institutionError) {
        throw new InternalServerErrorException(
          `Failed to fetch selected institution: ${institutionError.message}`,
        );
      }
      if (!data) {
        throw new BadRequestException(
          'The selected institution was not found.',
        );
      }
      institution = data;
    }

    const { error } = await this.supabase.rpc('set_user_institution', {
      p_user_id: userId,
      p_institution_id: institutionId,
    });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to update institution: ${error.message}`,
      );
    }

    const { error: profileError } = await this.supabase
      .from('user_info')
      .update({ institution_id: institutionId })
      .eq('id', userId);
    if (profileError) {
      throw new InternalServerErrorException(
        `Institution was selected, but the profile link could not be updated: ${profileError.message}`,
      );
    }

    if (!institutionId) return { institution: null };
    return { institution };
  }

  async savePushToken(userId: string, token: string) {
    const now = new Date().toISOString();
    const { error: tokenError } = await this.supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: token,
          is_active: true,
          updated_at: now,
        },
        { onConflict: 'expo_push_token' },
      );
    if (tokenError) {
      throw new InternalServerErrorException(
        `Push token could not be saved: ${tokenError.message}`,
      );
    }
    const { error: profileError } = await this.supabase
      .from('user_info')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (profileError) {
      throw new InternalServerErrorException(
        `Push token was saved, but the profile could not be updated: ${profileError.message}`,
      );
    }
    return { saved: true };
  }
}
