import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSourceDto {
  @IsIn(['lgu', 'institution'])
  source_type!: 'lgu' | 'institution';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  school_name!: string;

  @IsUrl({ require_protocol: true })
  facebook_url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsUUID()
  institution_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  facebook_page_id?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  website_url?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  rss_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
