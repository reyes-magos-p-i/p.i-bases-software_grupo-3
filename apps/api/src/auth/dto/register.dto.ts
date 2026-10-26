import { DateOnly } from '../../common/validation/date-only.decorator';
import { PersonalName } from '../../common/validation/personal-name.decorator';
import { CostaRicaMobile } from '../../common/validation/costa-rica-mobile.decorator';
import { Transform } from 'class-transformer';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import {
  Equals,
  isEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateBy,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
@ValidatorConstraint({ name: 'passwordNotPersonalInfo', async: false })
class PasswordNotPersonalInfo implements ValidatorConstraintInterface {
  validate(password: unknown, args: ValidationArguments): boolean {
    // SAFEGUARD: because many decorators order in a DTO atribute sometimes can be unpredictable
    if (typeof password !== 'string') return true;

    // CAST for convenience (TypeScript...), class-validator cannot 'type' a generic object
    const user = args.object as Record<string, unknown>;

    // TODO(rga): this is a basic constraint, this can be hardened.
    return (
      password !== user.email &&
      password !== user.firstName &&
      password !== user.lastName
    );
  }

  defaultMessage(): string {
    return 'La contraseña no puede ser igual al correo ni al nombre de usuario';
  }
}

export class RegisterDto {
  @Transform(trimLower)
  @ValidateBy(
    {
      name: 'isEmail',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          !/[\uD800-\uDFFF]/u.test(value) &&
          isEmail(value),
      },
    },
    { message: 'Correo inválido' },
  )
  @MaxUtf8Bytes(150, { message: 'El correo electrónico es demasiado largo.' })
  email: string;

  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @PersonalName({ message: 'El nombre solo puede contener letras y espacios.' })
  @MaxUtf8Bytes(100, {
    message: 'El nombre es demasiado largo. Usa una versión más corta.',
  })
  firstName: string;

  @Transform(trim)
  @IsString({ message: 'El apellido debe ser texto.' })
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @PersonalName({
    message: 'El apellido solo puede contener letras y espacios.',
  })
  @MaxUtf8Bytes(100, {
    message: 'El apellido es demasiado largo. Usa una versión más corta.',
  })
  lastName: string;

  @IsString({ message: 'Ingresa un celular de Costa Rica válido.' })
  @CostaRicaMobile()
  phone: string;

  @IsIn(['M', 'F', 'O', 'N'], {
    message: 'Selecciona una opción de género válida.',
  })
  gender: string;

  @DateOnly(
    { notFuture: true, minimumAge: 18 },
    {
      message:
        'Selecciona una fecha de nacimiento válida. Debes tener al menos 18 años para registrarte.',
    },
  )
  birthDate: string;

  @IsIn(['es', 'en'], { message: 'Selecciona español o inglés como idioma.' })
  language: string;

  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_-]).{8,}$/, {
    message:
      'Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial (!@#$%^&*_-).',
  })
  @MaxLength(128, { message: 'La contraseña no puede superar 128 caracteres.' })
  @Validate(PasswordNotPersonalInfo)
  password: string;

  @Equals(true, { message: 'Debes aceptar los términos y condiciones' })
  acceptTerms: boolean;
}
