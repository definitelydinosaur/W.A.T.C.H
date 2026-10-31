import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { AlertsService } from './alerts.service';
import { AlertsQueryDto } from './dto/alerts-query.dto';
import { CreateSourceDto } from './dto/create-source.dto';
import { ManualAnnouncementDto } from './dto/manual-announcement.dto';
import { TestHazardDto } from './dto/test-hazard.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('admin')
export class AdminAlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  @Post('sources')
  async createSource(
    @Body() body: CreateSourceDto,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.createSource(body);
  }

  @Get('announcements/pending')
  async getPendingReview(
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.getPendingReview();
  }

  @Get('announcements/review')
  async getLegacyPendingReview(
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.getPendingReview();
  }

  @Patch('sources/:id')
  async updateSource(
    @Param('id') id: string,
    @Body() body: UpdateSourceDto,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.setSourceActive(id, body.is_active);
  }

  @Post('announcements')
  async addManualAnnouncement(
    @Body() body: ManualAnnouncementDto,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.addManualAnnouncement(body);
  }

  @Patch('announcements/:id/approve')
  async approveAnnouncement(
    @Param('id') id: string,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.reviewAnnouncement(id, true);
  }

  @Patch('announcements/:id/reject')
  async rejectAnnouncement(
    @Param('id') id: string,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-admin-token') legacyKey?: string,
    @Req() req?: Request,
  ) {
    await this.authorize(req, adminKey ?? legacyKey);
    return this.alerts.reviewAnnouncement(id, false);
  }

  @Post('test-hazard')
  async testHazard(
    @Body() body: TestHazardDto,
    @Req() req: Request,
    @Headers('x-admin-key') adminKey?: string,
  ) {
    if (this.config.get<string>('ENABLE_TEST_ENDPOINTS') !== 'true') {
      throw new NotFoundException('The test hazard endpoint is disabled.');
    }
    const userId = await this.authorize(req, adminKey);
    if (!userId) {
      throw new ForbiddenException(
        'Test hazards require an administrator account so the home location can be derived from its session.',
      );
    }
    return this.alerts.createTestHazard(userId, body.hazard_type);
  }

  private async authorize(
    req?: Request,
    adminKey?: string,
  ): Promise<string | null> {
    const configuredKey =
      this.config.get<string>('ADMIN_API_KEY') ??
      this.config.get<string>('ANNOUNCEMENT_ADMIN_TOKEN');
    if (adminKey && configuredKey && safeTokenMatch(configuredKey, adminKey)) {
      return null;
    }
    const authorization = req?.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'An admin API key or admin session is required.',
      );
    }
    const token = authorization.slice(7);
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Admin session is invalid or expired.');
    }
    const { data: profile, error: profileError } = await this.supabase
      .from('user_info')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError)
      throw new ForbiddenException('Admin role could not be verified.');
    if (profile?.role !== 'admin') {
      throw new ForbiddenException('Administrator role is required.');
    }
    return data.user.id;
  }
}

@Controller('alerts')
@UseGuards(SupabaseAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  getUserAlerts(
    @Req() req: AuthenticatedRequest,
    @Query() query: AlertsQueryDto,
  ) {
    return this.alerts.getUserAlerts(req.user.id, query.locationId);
  }

  @Get('announcements/:id')
  getAnnouncement(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.alerts.getAnnouncement(req.user.id, id);
  }

  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.alerts.markNotificationRead(req.user.id, id);
  }

  @Delete('notifications/:id')
  softDelete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.alerts.softDeleteNotification(req.user.id, id);
  }
}

function safeTokenMatch(expectedValue: string, providedValue: string) {
  const expected = Buffer.from(expectedValue);
  const actual = Buffer.from(providedValue);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
