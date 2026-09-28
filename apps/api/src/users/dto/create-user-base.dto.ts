import {
  IsDefined,
  isEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateBy,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserBaseDto {
  @IsDefined({ message: 'El rol es obligatorio.' })
  @IsEnum(UserRole, {
    message: 'El rol debe ser administrador, empleado o cliente.',
  })
  role: UserRole;

  @IsDefined({ message: 'El correo electrónico es obligatorio.' })
  @IsString({ message: 'El correo electrónico debe ser texto.' })
  @ValidateBy(
    {
      name: 'isEmail',
      validator: {
        // The email validator can throw when measuring malformed Unicode.
        validate: (value: unknown): boolean =>
          typeof value === 'string' &&
          !/[\uD800-\uDFFF]/u.test(value) &&
          isEmail(value),
      },
    },
    { message: 'El correo electrónico debe tener un formato válido.' },
  )
  @MaxUtf8Bytes(150)
  email: string;

  @IsDefined({ message: 'El primer nombre es obligatorio.' })
  @IsString({ message: 'El primer nombre debe ser texto.' })
  @Matches(/\S/u, {
    message: 'El primer nombre no puede estar vacío ni contener solo espacios.',
  })
  @MaxUtf8Bytes(100)
  firstName: string;

  @IsOptional()
  @IsString({ message: 'El segundo nombre debe ser texto.' })
  @MaxUtf8Bytes(100)
  secondName?: string | null;
}
