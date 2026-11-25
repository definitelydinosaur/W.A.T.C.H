import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MapModule } from '../map/map.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdminAlertsController, AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AdminFeaturesController } from './admin-features.controller';
import { AdminFeaturesService } from './admin-features.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { HazardFeedService } from './hazard-feed.service';

@Module({
  imports: [AiModule, MapModule, NotificationsModule, SupabaseModule],
  controllers: [
    AdminAlertsController,
    AdminFeaturesController,
    AlertsController,
  ],
  providers: [
    AlertsService,
    AdminFeaturesService,
    HazardFeedService,
    AdminAuthGuard,
  ],
})
export class AlertsModule {}
