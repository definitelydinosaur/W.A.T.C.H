import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

function normalizeFullName(value: unknown, source: unknown): unknown {
  if (value !== null && value !== undefined) return value;
  if (source && typeof source === 'object') {
    const sourceRecord = source as Record<string, unknown>;
    return sourceRecord.fullName ?? sourceRecord.fullname;
  }
  return value;
}

export class RegisterDto {
  @Transform(({ value, obj }: { value: unknown; obj: unknown }) =>
    normalizeFullName(value, obj),
  )
  @IsString()
  @MinLength(3)
  fullName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
