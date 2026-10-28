import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AlertsService } from './alerts.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ManualAnnouncementDto } from './dto/manual-announcement.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

@Controller('admin')
export class AdminAlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {}

  @Post('sources')
  createSource(
    @Body() body: CreateSourceDto,
    @Headers('x-admin-token') token?: string,
  ) {
    this.authorize(token);
    return this.alerts.createSource(body);
  }

  @Get('announcements/review')
  getPendingReview(@Headers('x-admin-token') token?: string) {
    this.authorize(token);
    return this.alerts.getPendingReview();
  }

  @Patch('sources/:id')
  updateSource(
    @Param('id') id: string,
    @Body() body: UpdateSourceDto,
    @Headers('x-admin-token') token?: string,
  ) {
    this.authorize(token);
    return this.alerts.setSourceActive(id, body.is_active);
  }

  @Post('announcements')
  addManualAnnouncement(
    @Body() body: ManualAnnouncementDto,
    @Headers('x-admin-token') token?: string,
  ) {
    this.authorize(token);
    return this.alerts.addManualAnnouncement(body);
  }

  private authorize(token?: string) {
    const expectedValue = this.config.get<string>('ANNOUNCEMENT_ADMIN_TOKEN');
    if (!expectedValue || !token)
      throw new UnauthorizedException('Admin token is required.');
    const expected = Buffer.from(expectedValue);
    const actual = Buffer.from(token);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Invalid admin token.');
    }
  }
}

@Controller('alerts')
@UseGuards(SupabaseAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  getUserAlerts(@Req() req: Request & { user: { id: string } }) {
    return this.alerts.getUserAlerts(req.user.id);
  }

  @Get('announcements/:id')
  getAnnouncement(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.alerts.getAnnouncement(req.user.id, id);
  }

  @Patch('notifications/:id/read')
  markRead(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.alerts.markNotificationRead(req.user.id, id);
  }
}
