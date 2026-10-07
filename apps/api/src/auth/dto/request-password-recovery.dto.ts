import { Transform } from 'class-transformer';
import { IsEmail, IsIn, MaxLength } from 'class-validator';

export class RequestPasswordRecoveryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsIn(['client', 'employee'])
  accountType!: 'client' | 'employee';
}
