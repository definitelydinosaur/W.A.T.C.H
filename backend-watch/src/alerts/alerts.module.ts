import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MapModule } from '../map/map.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdminAlertsController, AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AiModule, MapModule, NotificationsModule, SupabaseModule],
  controllers: [AdminAlertsController, AlertsController],
  providers: [AlertsService],
})
export class AlertsModule { }
