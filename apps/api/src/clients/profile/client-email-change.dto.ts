import { PickType } from '@nestjs/mapped-types';
import { IsJWT, IsString, MaxLength } from 'class-validator';
import { CreateUserBaseDto } from '../../users/dto/create-user-base.dto';

export class RequestClientEmailChangeDto extends PickType(CreateUserBaseDto, [
  'email',
] as const) {}

export class ConfirmClientEmailChangeDto {
  @IsString({ message: 'El enlace de confirmación no es válido.' })
  @MaxLength(4096, { message: 'El enlace de confirmación no es válido.' })
  @IsJWT({ message: 'El enlace de confirmación no es válido.' })
  token: string;
}
