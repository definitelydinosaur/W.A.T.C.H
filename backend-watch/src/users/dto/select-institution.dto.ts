import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SelectInstitutionDto {
  @IsOptional()
  @IsUUID()
  institutionId?: string | null;

  @ValidateIf(
    (value: SelectInstitutionDto) => value.institutionId === undefined,
  )
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  @MaxLength(500)
  facebookPageUrl?: string;
}
