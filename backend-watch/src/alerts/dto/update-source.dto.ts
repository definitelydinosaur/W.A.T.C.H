import { IsBoolean } from 'class-validator';

export class UpdateSourceDto {
  @IsBoolean()
  is_active!: boolean;
}
