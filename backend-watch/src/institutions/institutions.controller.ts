import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { ImportInstitutionDto } from './dto/import-institution.dto';
import { UpdateInstitutionLinksDto } from './dto/update-institution-links.dto';
import { InstitutionsService } from './institutions.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    app_metadata: Record<string, unknown>;
  };
};

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Get('search')
  search(@Query('q') query?: string) {
    return this.searchByQuery(query);
  }

  @Get()
  searchLegacy(@Query('query') query?: string) {
    return this.searchByQuery(query);
  }

  @Post('import')
  @UseGuards(SupabaseAuthGuard)
  async importSuggested(
    @Body() input: ImportInstitutionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const institution = await this.institutionsService.importSuggested(
      input,
      req.user.id,
    );
    return { institution };
  }

  @Patch(':id/links')
  @UseGuards(SupabaseAuthGuard)
  updateLinks(
    @Param('id') id: string,
    @Body() links: UpdateInstitutionLinksDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user.app_metadata.role !== 'admin') {
      throw new ForbiddenException('Administrator access is required.');
    }
    return this.institutionsService.updateLinks(id, links);
  }

  private searchByQuery(query?: string) {
    const normalized = query?.trim();
    if (!normalized || normalized.length < 3 || normalized.length > 120) {
      throw new BadRequestException(
        'Enter an institution name between 3 and 120 characters.',
      );
    }
    return this.institutionsService.search(normalized);
  }
}
