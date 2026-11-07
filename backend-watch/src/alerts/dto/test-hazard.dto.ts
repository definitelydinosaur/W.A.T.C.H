import { IsIn } from 'class-validator';

export class TestHazardDto {
  @IsIn(['heat', 'rain'])
  hazard_type!: 'heat' | 'rain';
}
