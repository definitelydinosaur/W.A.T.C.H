
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [EmailController],
  providers: [EmailService, SupabaseAuthGuard],
  exports: [EmailService],
})
export class EmailModule {}
