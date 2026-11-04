import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SupabaseModule, AiModule, NotificationsModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
