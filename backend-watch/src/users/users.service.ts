
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

  // 2. Get the public image URL
  const { data } = this.supabase.storage
    .from('watch_storage')
    .getPublicUrl(filePath);

  const imageUrl = data.publicUrl;

  const { data: updatedProfile, error: updateError } =
    await this.supabase
      .from('user_info')
      .update({ profile_pic: imageUrl })
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
      `Image uploaded, but no user_info row matched ID: ${userId}. Check the user ID and table schema.`,
    );
  }

  // 4. Return the saved URL
  return {
    message: 'Profile picture updated successfully.',
    profile_pic: updatedProfile.profile_pic,
  };
}
}
