
import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Patch,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ProfileService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('profile')
@UseGuards(SupabaseAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // Upload profile picture
  @Post('picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
        ];

        if (!allowed.includes(file.mimetype)) {
          return callback(
            new BadRequestException('Unsupported image type.'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async uploadPicture(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.profileService.uploadProfilePicture(
      req.user.id,
      file,
    );
  }

  // Fetch profile picture
  @Get('picture')
  async getProfilePicture(
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.profileService.getProfilePicture(req.user.id);
  }

  
@Get()
async getProfile(
  @Req() req: Request & { user: { id: string } },
) {
  return this.profileService.getProfile(req.user.id);
}


  
  @Patch()
  async updateProfile(
    @Body() updates: UpdateProfileDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.profileService.updateProfile(
      req.user.id,
      updates,
    );
  }
}
