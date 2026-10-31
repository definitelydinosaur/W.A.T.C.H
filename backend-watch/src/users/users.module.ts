import { Module } from '@nestjs/common';
import { ProfileController } from './users.controller';
import { ProfileService } from './users.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [SupabaseModule, InstitutionsModule, AlertsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
