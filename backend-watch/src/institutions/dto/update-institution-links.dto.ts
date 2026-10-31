import { IsOptional, IsUrl, MaxLength } from 'class-validator';

export class UpdateInstitutionLinksDto {
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  website_url?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  facebook_page_url?: string | null;
}
