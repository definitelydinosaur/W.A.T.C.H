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

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    AuthModule,
    WeatherModule,
    AiModule,
    MapModule,
    ProfileModule,
    InstitutionsModule,
    AlertsModule,
  ],
})
export class AppModule {}
