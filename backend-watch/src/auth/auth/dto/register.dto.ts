import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value, obj }) => value ?? obj.fullName ?? obj.fullname)
  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}