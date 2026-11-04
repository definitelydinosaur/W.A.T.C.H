import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ManualAnnouncementDto {
  @IsUUID()
  source_id!: string;

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

  @IsDateString()
  posted_at!: string;
}
