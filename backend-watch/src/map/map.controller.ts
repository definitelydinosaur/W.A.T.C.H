import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MapService } from './map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('geocode')
  search(@Query('query') query?: string) {
    const normalized = query?.trim();
    if (!normalized || normalized.length < 2 || normalized.length > 120) {
      throw new BadRequestException(
        'Enter a location between 2 and 120 characters.',
      );
    }
    return this.mapService.geocode(normalized);
  }

  @Get('suggest')
  suggest(@Query('query') query?: string, @Query('kind') kind?: string) {
    const normalized = query?.trim();
    if (!normalized || normalized.length < 2 || normalized.length > 120) {
      throw new BadRequestException('Enter at least 2 characters to search.');
    }
    if (kind !== 'location' && kind !== 'institution') {
      throw new BadRequestException('Choose a location or institution search.');
    }
    return this.mapService.suggest(normalized, kind);
  }
}
