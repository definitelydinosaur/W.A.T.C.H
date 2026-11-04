import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PushService } from './push.service';

@Module({
  imports: [SupabaseModule],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
