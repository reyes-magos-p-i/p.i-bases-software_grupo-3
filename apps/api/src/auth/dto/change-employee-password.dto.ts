import { IsString, MinLength } from 'class-validator';

export class ChangeEmployeePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;

  @IsString()
  @MinLength(1)
  confirmNewPassword!: string;
}
