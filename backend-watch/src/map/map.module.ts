import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { HazardIngestionService } from './hazard-ingestion.service';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [SupabaseModule, AiModule],
  controllers: [MapController],
  providers: [MapService, HazardIngestionService],
  exports: [MapService, HazardIngestionService],
})
export class MapModule { }
