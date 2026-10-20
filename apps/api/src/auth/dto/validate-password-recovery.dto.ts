import { Matches } from 'class-validator';

export class ValidatePasswordRecoveryDto {
  @Matches(/^[a-f0-9]{64}$/u)
  token!: string;
}
