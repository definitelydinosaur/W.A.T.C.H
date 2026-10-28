
import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ProfileService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient,
  ) {}

  
async uploadProfilePicture(
  userId: string,
  file: Express.Multer.File,
) {
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
  const { data: updatedProfile, error: updateError } =
    await this.supabase
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

  const { data: signedData, error: signedError } =
    await this.supabase.storage
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

  const filePath = data?.profile_pic;

  if (!filePath) {
    return { profile_pic: null };
  }

  const { data: signedData, error: signedError } =
    await this.supabase.storage
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
  console.log('Authenticated user ID:', userId);
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

  if (
    updateData.name !== undefined &&
    updateData.name.length === 0
  ) {
    throw new BadRequestException('Name cannot be empty.');
  }

  if (
    updateData.country !== undefined &&
    updateData.country.length === 0
  ) {
    throw new BadRequestException('Country cannot be empty.');
  }

  const { data, error } = await this.supabase
    .from('user_info')
    .update(updateData)
    .eq('id', userId)
    .select('id, name, birthdate, country')
    .maybeSingle();


console.log('Supabase update data:', data);
console.log('Supabase update error:', error);
console.log('Authenticated user ID:', userId);

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
    .select('id, name, birthdate, country')
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

  return { profile: data };
}




}
