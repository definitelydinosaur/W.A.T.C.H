import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportInstitutionDto {
  @IsString()
  @MaxLength(40)
  external_id!: string;

  @IsString()
  @MaxLength(20)
  external_source!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
