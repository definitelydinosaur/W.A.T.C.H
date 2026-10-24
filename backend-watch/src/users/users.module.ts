
import { Module } from '@nestjs/common';
import { ProfileController } from './users.controller';
import { ProfileService } from './users.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
