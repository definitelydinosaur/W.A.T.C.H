import { IsDateString, IsOptional } from 'class-validator';

export class LocationPromptDto {
  @IsOptional()
  @IsDateString()
  dismissedAt?: string | null;
}
