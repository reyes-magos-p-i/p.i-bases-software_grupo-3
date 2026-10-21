import { DateOnly } from '../../common/validation/date-only.decorator';
import { PersonalName } from '../../common/validation/personal-name.decorator';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { CostaRicaMobile } from '../../common/validation/costa-rica-mobile.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CreateUserBaseDto } from './create-user-base.dto';
import { CreateAddressDto } from './create-address.dto';

export class CreateClientDto extends CreateUserBaseDto {
  @IsIn([UserRole.CLIENT], {
    message: 'El rol debe ser cliente.',
  })
  declare role: UserRole.CLIENT;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString({ message: 'El primer apellido debe ser texto.' })
  @PersonalName({
    message: 'El primer apellido solo puede contener letras y espacios.',
  })
  @MaxUtf8Bytes(100, {
    message:
      'El primer apellido es demasiado largo. Usa una versión más corta.',
  })
  firstSurname?: string | null;

  @IsOptional()
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @PersonalName({
    message: 'El segundo apellido solo puede contener letras y espacios.',
  })
  @MaxUtf8Bytes(100, {
    message:
      'El segundo apellido es demasiado largo. Usa una versión más corta.',
  })
  secondSurname?: string | null;

  @IsOptional()
  @DateOnly(
    { notFuture: true },
    { message: 'Selecciona una fecha de nacimiento válida que no sea futura.' },
  )
  birthday?: string | null;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto.' })
  @CostaRicaMobile()
  phoneNumber?: string | null;

  @IsOptional()
  @IsObject({ message: 'La dirección debe ser un objeto válido.' })
  @ValidateNested({ message: 'La dirección debe ser un objeto válido.' })
  @Type(() => CreateAddressDto)
  address?: CreateAddressDto | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'El idioma debe ser texto.' })
  @IsIn(['es', 'en'], { message: 'Selecciona español o inglés como idioma.' })
  language?: string;
}
