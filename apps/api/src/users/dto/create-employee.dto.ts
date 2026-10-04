import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CreateUserBaseDto } from './create-user-base.dto';
import { CreateAddressDto } from './create-address.dto';

export class CreateEmployeeDto extends CreateUserBaseDto {
  @IsIn([UserRole.ADMINISTRATOR, UserRole.EMPLOYEE], {
    message: 'El rol debe ser administrador o empleado.',
  })
  declare role: UserRole.ADMINISTRATOR | UserRole.EMPLOYEE;

  @IsDefined({ message: 'El primer apellido es obligatorio.' })
  @IsString({ message: 'El primer apellido debe ser texto.' })
  @Matches(/\S/u, {
    message:
      'El primer apellido no puede estar vacío ni contener solo espacios.',
  })
  @MaxUtf8Bytes(100)
  firstSurname: string;

  @IsDefined({ message: 'El segundo apellido es obligatorio.' })
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @Matches(/\S/u, {
    message:
      'El segundo apellido no puede estar vacío ni contener solo espacios.',
  })
  @MaxUtf8Bytes(100)
  secondSurname: string;

  @IsDefined({ message: 'La fecha de nacimiento es obligatoria.' })
  @IsDateString(
    { strict: true },
    { message: 'La fecha de nacimiento debe ser una fecha válida.' },
  )
  @Length(10, 10, {
    message: 'La fecha de nacimiento debe tener el formato YYYY-MM-DD.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, {
    message: 'La fecha de nacimiento debe tener el formato YYYY-MM-DD.',
  })
  birthday: string;

  @IsDefined({ message: 'La fecha de contratación es obligatoria.' })
  @IsDateString(
    { strict: true },
    { message: 'La fecha de contratación debe ser una fecha válida.' },
  )
  @Length(10, 10, {
    message: 'La fecha de contratación debe tener el formato YYYY-MM-DD.',
  })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/u, {
    message:
      'La fecha de contratación debe tener el formato YYYY-MM-DD con un año entre 0001 y 9999.',
  })
  hireDate: string;

  @IsDefined({ message: 'El teléfono es obligatorio.' })
  @IsString({ message: 'El teléfono debe ser texto.' })
  @Matches(/\S/u, {
    message: 'El teléfono no puede estar vacío ni contener solo espacios.',
  })
  @MaxUtf8Bytes(20)
  phoneNumber: string;

  @IsDefined({ message: 'La dirección es obligatoria.' })
  @IsObject({ message: 'La dirección debe ser un objeto válido.' })
  @ValidateNested({ message: 'La dirección debe ser un objeto válido.' })
  @Type(() => CreateAddressDto)
  address: CreateAddressDto;

  @IsDefined({ message: 'El identificador de la sucursal es obligatorio.' })
  @IsInt({
    message: 'El identificador de la sucursal debe ser un número entero.',
  })
  @Min(Number.MIN_SAFE_INTEGER, {
    message: 'El identificador de la sucursal está fuera del rango admitido.',
  })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'El identificador de la sucursal está fuera del rango admitido.',
  })
  branchId: number;
}
