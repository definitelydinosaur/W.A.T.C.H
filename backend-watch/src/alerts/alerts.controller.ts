import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AlertsService } from './alerts.service';
import { AlertsQueryDto } from './dto/alerts-query.dto';
import { CreateSourceDto } from './dto/create-source.dto';
import { ManualAnnouncementDto } from './dto/manual-announcement.dto';
import { TestHazardDto } from './dto/test-hazard.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminAlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {}

  @Post('sources')
  async createSource(@Body() body: CreateSourceDto) {
    return this.alerts.createSource(body);
  }

  @Get('announcements/pending')
  async getPendingReview() {
    return this.alerts.getPendingReview();
  }

  @Get('announcements/review')
  async getLegacyPendingReview() {
    return this.alerts.getPendingReview();
  }

  @Patch('sources/:id')
  async updateSource(@Param('id') id: string, @Body() body: UpdateSourceDto) {
    return this.alerts.setSourceActive(id, body.is_active);
  }

  @Post('announcements')
  async addManualAnnouncement(@Body() body: ManualAnnouncementDto) {
    return this.alerts.addManualAnnouncement(body);
  }

  @Patch('announcements/:id/approve')
  async approveAnnouncement(@Param('id') id: string) {
    return this.alerts.reviewAnnouncement(id, true);
  }

  @Patch('announcements/:id/reject')
  async rejectAnnouncement(@Param('id') id: string) {
    return this.alerts.reviewAnnouncement(id, false);
  }

  @Post('test-hazard')
  async testHazard(@Body() body: TestHazardDto, @Req() req: Request) {
    if (this.config.get<string>('ENABLE_TEST_ENDPOINTS') !== 'true') {
      throw new NotFoundException('The test hazard endpoint is disabled.');
    }
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      throw new ForbiddenException('Administrator session is required.');
    }
    return this.alerts.createTestHazard(userId, body.hazard_type);
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
