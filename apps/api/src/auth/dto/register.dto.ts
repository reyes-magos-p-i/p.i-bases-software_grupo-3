import { Transform } from 'class-transformer';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import {
  Equals,
  isEmail,
  IsIn,
  IsISO8601,
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
const normalizeCostaRicaPhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{4}[-\s]?\d{4}$/u.test(value.trim())
    ? value.trim().replace(/[-\s]/gu, '')
    : value;

@ValidatorConstraint({ name: 'minimumRegistrationAge', async: false })
class MinimumRegistrationAge implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    if (!match) return true;

    const [, yearText, monthText, dayText] = match;
    const birthYear = Number(yearText);
    const birthMonth = Number(monthText);
    const birthDay = Number(dayText);
    const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
    if (
      birthDate.getUTCFullYear() !== birthYear ||
      birthDate.getUTCMonth() + 1 !== birthMonth ||
      birthDate.getUTCDate() !== birthDay
    ) {
      return true;
    }

    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts();
    const today = Object.fromEntries(
      todayParts.map(({ type, value: part }) => [type, part]),
    );
    const todayYear = Number(today.year);
    const todayMonth = Number(today.month);
    const todayDay = Number(today.day);

    return (
      birthYear < todayYear - 18 ||
      (birthYear === todayYear - 18 &&
        (birthMonth < todayMonth ||
          (birthMonth === todayMonth && birthDay <= todayDay)))
    );
  }

  defaultMessage(): string {
    return 'Debes tener al menos 18 años para registrarte';
  }
}

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
  @MaxUtf8Bytes(150)
  email: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(100)
  lastName: string;

  @Transform(normalizeCostaRicaPhone)
  @IsString()
  @Matches(/^\d{8}$/u, {
    message: 'Ingresa un teléfono costarricense válido de 8 dígitos',
  })
  phone: string;

  @IsIn(['M', 'F', 'O', 'N'])
  gender: string;

  @IsISO8601({ strict: true }) // Real Calendary Date
  @Matches(/^\d{4}-\d{2}-\d{2}$/) // without 'Hour' so TO_DATE in the DB do not fail
  @Validate(MinimumRegistrationAge)
  birthDate: string;

  @IsIn(['es', 'en'])
  language: string;

  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_-]).{8,}$/, {
    message:
      'Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial (!@#$%^&*_-).',
  })
  @MaxLength(128)
  @Validate(PasswordNotPersonalInfo)
  password: string;

  @Equals(true, { message: 'Debes aceptar los términos y condiciones' })
  acceptTerms: boolean;
}
