import { IsString, Matches } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/u)
  token: string;
}
