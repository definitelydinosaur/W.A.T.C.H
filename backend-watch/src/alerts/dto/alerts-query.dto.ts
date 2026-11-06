import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class AlertsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;
}
