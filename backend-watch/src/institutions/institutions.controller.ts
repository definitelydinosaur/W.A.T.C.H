import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Get()
  search(@Query('query') query?: string) {
    const normalized = query?.trim();
    if (!normalized || normalized.length < 2 || normalized.length > 120) {
      throw new BadRequestException(
        'Enter an institution name between 2 and 120 characters.',
      );
    }

    return this.institutionsService.search(normalized);
  }
}
