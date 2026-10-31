import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  IsIn,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AiService } from './ai.service';

class HazardGuidanceDto {
  @IsIn(['Normal', 'Advisory', 'Warning', 'Severe'])
  riskLevel!: string;

  @IsIn(['rain', 'wind', 'heat', 'general'])
  hazardType!: string;

  @IsObject()
  measurements!: Record<string, number>;
}

class AnnouncementSummaryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsUrl({ require_protocol: true })
  sourceUrl!: string;
}

@Controller('ai')
export class AiController {
  private readonly requestsByIp = new Map<string, number[]>();

  constructor(private readonly aiService: AiService) {}

  @Post('hazard-guidance')
  getHazardGuidance(@Body() body: HazardGuidanceDto, @Req() request: Request) {
    this.enforceRateLimit(request.ip ?? request.socket.remoteAddress);
    return this.aiService.getHazardGuidance(body);
  }

  @Post('announcement-summary')
  summarizeAnnouncement(
    @Body() body: AnnouncementSummaryDto,
    @Req() request: Request,
    @Headers('x-announcement-admin-token') adminToken?: string,
  ) {
    this.enforceRateLimit(request.ip ?? request.socket.remoteAddress);
    return this.aiService.summarizeAnnouncement({
      ...body,
      adminConfirmationToken: adminToken,
    });
  }

  private enforceRateLimit(clientAddress?: string) {
    const key = clientAddress ?? 'unknown';
    const now = Date.now();
    const recentRequests = (this.requestsByIp.get(key) ?? []).filter(
      (timestamp) => now - timestamp < 60_000,
    );
    if (recentRequests.length >= 10) {
      throw new HttpException(
        'AI request limit reached. Please wait before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentRequests.push(now);
    this.requestsByIp.set(key, recentRequests);

    if (this.requestsByIp.size > 5000) {
      for (const [address, timestamps] of this.requestsByIp) {
        if (timestamps.every((timestamp) => now - timestamp >= 60_000)) {
          this.requestsByIp.delete(address);
        }
      }
    }
  }
}
