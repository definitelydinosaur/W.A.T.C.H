import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AuthModule } from './auth/auth/auth.module';
import { WeatherModule } from './weather/weather.module';
import { AiModule } from './ai/ai.module';
import { MapModule } from './map/map.module';
import { ProfileModule } from './users/users.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsModule } from './alerts/alerts.module';
import { HealthController } from './health/health.controller';
import { ChatbotModule } from './chatbot/chatbot.module';
import { validateEnvironment } from './config/environment';
import { EmailModule } from './email/email.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
      validate: validateEnvironment,
    }),
    AuthModule,
    WeatherModule,
    AiModule,
    MapModule,
    ProfileModule,
    InstitutionsModule,
    AlertsModule,
    ChatbotModule,
    EmailModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
