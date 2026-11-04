import { IsString, Matches, MaxLength } from 'class-validator';

export class SavePushTokenDto {
  @IsString()
  @Matches(/^(Exponent|Expo)PushToken\[[^\]]+\]$/)
  @MaxLength(200)
  token!: string;
}
