import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { MapModule } from '../map/map.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';

@Module({
  imports: [SupabaseModule, MapModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService, SupabaseAuthGuard],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
