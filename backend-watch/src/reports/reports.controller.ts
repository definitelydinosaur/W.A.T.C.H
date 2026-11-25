
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ReportsService } from './reports.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
  ) {}

  @Post()
  async submitReport(
    @Req() request: Request & { user: { id: string } },
    @Body() body: { title: string; body: string },
  ) {
    const title = body.title?.trim();
    const description = body.body?.trim();

    if (!title || !description) {
      throw new BadRequestException(
        'Report title and description are required.',
      );
    }

    if (title.length > 150 || description.length > 5000) {
      throw new BadRequestException(
        'Report title or description exceeds the allowed length.',
      );
    }

    return this.reportsService.submitReport(
      request.user.id,
      title,
      description,
    );
  }
}
