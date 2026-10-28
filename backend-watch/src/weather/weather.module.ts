import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

@Module({
  imports: [SupabaseModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
