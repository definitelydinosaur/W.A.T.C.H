import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AuthModule } from './auth/auth/auth.module';
import { WeatherModule } from './weather/weather.module';
import { AiModule } from './ai/ai.module';
import { MapModule } from './map/map.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    AuthModule,
    WeatherModule,
    AiModule,
    MapModule,
  ],
})
export class AppModule {}