import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AlertsService } from './alerts.service';
import { AdminFeaturesService } from './admin-features.service';

type AdminRequest = Request & { user: { id: string } };

class ManualSendDto {
  @IsIn(['institution', 'local', 'weather', 'system'])
  type!: 'institution' | 'local' | 'weather' | 'system';

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source_name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  source_url?: string;

  @IsIn(['all', 'me', 'institution'])
  audience!: 'all' | 'me' | 'institution';

  @IsOptional()
  @IsUUID()
  institution_id?: string;
}

class FormatSystemDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  raw_text!: string;

  @IsOptional()
  @IsUUID()
  draft_id?: string;
}

class ReviseSystemDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  instruction!: string;
}

class AssignPagasaAreasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(100, { each: true })
  affected_areas!: string[];
}

@Controller('admin/features')
@UseGuards(AdminAuthGuard)
export class AdminFeaturesController {
  constructor(
    private readonly features: AdminFeaturesService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('institutions')
  getInstitutions() {
    return this.features.getInstitutions();
  }

  @Post('notifications/send')
  sendManualNotification(
    @Body() body: ManualSendDto,
    @Req() request: AdminRequest,
  ) {
    return this.features.sendManualNotification(request.user.id, body);
  }

  @Post('notifications/test')
  sendTestPush(@Req() request: AdminRequest) {
    return this.features.sendTestPush(request.user.id);
  }

  @Get('announcements')
  getAnnouncements(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.features.getAutomatedAnnouncements(
      page,
      limit,
      search,
      category,
    );
  }

  @Post('announcements/:id/resend-test')
  resendAnnouncementToAllUsers(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendAnnouncementToAllUsers(id, request.user.id);
  }

  @Post('announcements/:id/resend-all')
  resendAnnouncementToAllUsersNow(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendAnnouncementToAllUsers(
      id,
      request.user.id,
      'all',
    );
  }

  @Post('weather-events/:id/resend-test')
  resendWeatherEventToMe(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendWeatherEvent(id, request.user.id, 'me');
  }

  @Post('weather-events/:id/resend-all')
  resendWeatherEventToAffectedCity(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendWeatherEvent(id, request.user.id, 'all');
  }

  @Post('hazards/:id/resend-test')
  resendHazardToAllUsers(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendHazardToAllUsers(id, request.user.id, false);
  }

  @Post('hazards/:id/resend-all')
  resendHazardToAllUsersNow(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendHazardToAllUsers(
      id,
      request.user.id,
      false,
      'all',
    );
  }

  @Post('safety-tips/:hazardId/resend-test')
  resendSafetyTipToAllUsers(
    @Param('hazardId') hazardId: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendHazardToAllUsers(
      hazardId,
      request.user.id,
      true,
    );
  }

  @Post('pagasa/:id/resend-test')
  resendPagasaAlertToAllUsers(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendPagasaAlertToAllUsers(id, request.user.id);
  }

  @Post('pagasa/:id/resend-all')
  resendPagasaAlertToAllUsersNow(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.features.resendPagasaAlertToAllUsers(
      id,
      request.user.id,
      'all',
    );
  }

  @Patch('pagasa/:id/areas')
  assignPagasaAreas(
    @Param('id') id: string,
    @Body() body: AssignPagasaAreasDto,
  ) {
    return this.alerts.assignPagasaAreas(id, body.affected_areas);
  }

  @Post('system-drafts/format')
  formatSystemDraft(
    @Body() body: FormatSystemDraftDto,
    @Req() request: AdminRequest,
  ) {
    return this.features.formatSystemDraft(request.user.id, body);
  }

  @Post('system-drafts/:id/revise')
  reviseSystemDraft(
    @Param('id') id: string,
    @Body() body: ReviseSystemDraftDto,
    @Req() request: AdminRequest,
  ) {
    return this.features.reviseSystemDraft(
      request.user.id,
      id,
      body.instruction,
    );
  }

  @Delete('system-drafts/:id')
  discardSystemDraft(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.features.discardSystemDraft(request.user.id, id);
  }

  @Post('system-drafts/:id/publish')
  publishSystemDraft(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.features.publishSystemDraft(request.user.id, id);
  }

  @Get('system-announcements')
  getSystemAnnouncements() {
    return this.features.getSystemAnnouncements();
  }

  @Delete('system-announcements/:id')
  removeSystemAnnouncement(@Param('id') id: string) {
    return this.features.removeSystemAnnouncement(id);
  }
}
