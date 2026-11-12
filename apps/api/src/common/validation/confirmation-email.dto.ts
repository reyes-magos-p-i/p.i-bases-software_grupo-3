import { PickType } from '@nestjs/mapped-types';
import { IsDefined } from 'class-validator';
import { CreateUserBaseDto } from '../../users/dto/create-user-base.dto';

export class ConfirmationEmailDto extends PickType(CreateUserBaseDto, [
  'email',
] as const) {
  @IsDefined({
    message: 'Escribe el correo de tu sesión para confirmar esta acción.',
  })
  declare email: string;
}
