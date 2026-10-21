import { DateOnly } from '../../common/validation/date-only.decorator';
import { PersonalName } from '../../common/validation/personal-name.decorator';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { CostaRicaMobile } from '../../common/validation/costa-rica-mobile.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CreateUserBaseDto } from './create-user-base.dto';
import { CreateAddressDto } from './create-address.dto';

export class CreateEmployeeDto extends CreateUserBaseDto {
  @IsIn([UserRole.ADMINISTRATOR, UserRole.EMPLOYEE], {
    message: 'El rol debe ser administrador o empleado.',
  })
  declare role: UserRole.ADMINISTRATOR | UserRole.EMPLOYEE;

  @IsDefined({ message: 'El primer apellido es obligatorio.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El primer apellido debe ser texto.' })
  @Matches(/\S/u, {
    message:
      'El primer apellido no puede estar vacío ni contener solo espacios.',
  })
  @PersonalName({
    message: 'El primer apellido solo puede contener letras y espacios.',
  })
  @MaxUtf8Bytes(100, {
    message:
      'El primer apellido es demasiado largo. Usa una versión más corta.',
  })
  firstSurname: string;

  @IsDefined({ message: 'El segundo apellido es obligatorio.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @Matches(/\S/u, {
    message:
      'El segundo apellido no puede estar vacío ni contener solo espacios.',
  })
  @PersonalName({
    message: 'El segundo apellido solo puede contener letras y espacios.',
  })
  @MaxUtf8Bytes(100, {
    message:
      'El segundo apellido es demasiado largo. Usa una versión más corta.',
  })
  secondSurname: string;

  @IsDefined({ message: 'La fecha de nacimiento es obligatoria.' })
  @DateOnly(
    { notFuture: true },
    { message: 'Selecciona una fecha de nacimiento válida que no sea futura.' },
  )
  birthday: string;

  @IsDefined({ message: 'La fecha de contratación es obligatoria.' })
  @DateOnly(
    { notBefore: 'birthday' },
    {
      message:
        'Selecciona una fecha de contratación válida, igual o posterior al nacimiento.',
    },
  )
  hireDate: string;

  @IsDefined({ message: 'El teléfono es obligatorio.' })
  @IsString({ message: 'El teléfono debe ser texto.' })
  @CostaRicaMobile()
  phoneNumber: string;

  @IsDefined({ message: 'La dirección es obligatoria.' })
  @IsObject({ message: 'La dirección debe ser un objeto válido.' })
  @ValidateNested({ message: 'La dirección debe ser un objeto válido.' })
  @Type(() => CreateAddressDto)
  address: CreateAddressDto;

  @IsDefined({ message: 'Selecciona una sucursal.' })
  @IsInt({
    message: 'Selecciona una sucursal válida.',
  })
  @Min(1, {
    message: 'Selecciona una sucursal válida.',
  })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'Selecciona una sucursal válida.',
  })
  branchId: number;
}
