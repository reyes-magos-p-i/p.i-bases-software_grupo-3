import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeClientPasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;

  @IsString()
  @MinLength(1)
  confirmNewPassword!: string;

  @IsIn([30, 60, 90, 120])
  expirationDays!: number;
}