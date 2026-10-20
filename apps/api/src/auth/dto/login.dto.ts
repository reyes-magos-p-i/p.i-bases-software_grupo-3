import { Transform } from 'class-transformer';
import {
  isEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'El correo electrónico debe ser texto.' })
  @ValidateBy(
    {
      name: 'isEmail',
      validator: {
        // Avoid passing malformed Unicode to the email validator.
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

  @IsString({ message: 'La contraseña debe ser texto.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(128, { message: 'La contraseña no debe superar 128 caracteres.' })
  password: string;
}
