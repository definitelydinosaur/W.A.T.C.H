import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ManualAnnouncementDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  source_id?: number;

  @IsOptional()
  @IsIn(['lgu', 'institution'])
  source_type?: 'lgu' | 'institution';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  source_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsUUID()
  institution_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  external_post_id?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  source_url?: string;

  @IsOptional()
  @IsDateString()
  posted_at?: string;
}
