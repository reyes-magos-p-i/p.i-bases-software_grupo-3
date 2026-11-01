import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ValidatePasswordRecoveryDto } from './validate-password-recovery.dto';

export class ResetPasswordDto extends ValidatePasswordRecoveryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  temporaryPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  confirmNewPassword!: string;

  @IsIn([30, 60, 90, 120])
  expirationDays!: number;
}
