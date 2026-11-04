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
  @IsIn(['lgu_mayor', 'institution', 'barangay'])
  type!: 'lgu_mayor' | 'institution' | 'barangay';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  facebook_page_id?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  facebook_page_url?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  website_url?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  rss_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsUUID()
  institution_id?: string;

  @IsOptional()
  @IsBoolean()
  is_trusted?: boolean;
}
