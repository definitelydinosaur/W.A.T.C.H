
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


}
