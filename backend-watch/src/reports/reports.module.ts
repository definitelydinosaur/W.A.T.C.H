
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { EmailModule } from '../email/email.module';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Module({
  imports: [SupabaseModule, EmailModule],
  controllers: [ReportsController],
  providers: [ReportsService, SupabaseAuthGuard],
})
export class ReportsModule {}
