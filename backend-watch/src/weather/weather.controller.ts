import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  getForecast(
    @Query('latitude') latitudeValue?: string,
    @Query('longitude') longitudeValue?: string,
  ) {
    const latitude = Number(latitudeValue ?? 10.3157);
    const longitude = Number(longitudeValue ?? 123.8854);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Latitude or longitude is outside its valid range.');
    }

    return this.weatherService.getForecast(latitude, longitude);
  }
}
