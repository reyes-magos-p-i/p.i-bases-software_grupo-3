import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  isEmail,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { CostaRicaMobile } from '../../common/validation/costa-rica-mobile.decorator';
import type { UserCreationOptionsDto } from './user-creation-options.dto';
import { UserRole } from '../enums/user-role.enum';

const optionalName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateAddressDto {
  @IsDefined({ message: 'Selecciona un distrito.' })
  @IsInt({
    message: 'El identificador del distrito debe ser un número entero.',
  })
  @Min(1, { message: 'Selecciona un distrito válido.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'El distrito está fuera del rango admitido.',
  })
  districtId: number;

  @IsOptional()
  @IsString({ message: 'El detalle de la dirección debe ser texto.' })
  @MaxUtf8Bytes(255, {
    message:
      'El detalle de la dirección debe ser texto válido y no superar 255 bytes en UTF-8.',
  })
  details?: string | null;
}

class UpdateUserBaseDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined({ message: 'El primer nombre es obligatorio.' })
  @IsString({ message: 'El primer nombre debe ser texto.' })
  @Matches(/\S/u, { message: 'El primer nombre no puede estar vacío.' })
  @MaxUtf8Bytes(100, {
    message:
      'El primer nombre debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  firstName?: string;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(optionalName)
  @IsString({ message: 'El segundo nombre debe ser texto.' })
  @MaxUtf8Bytes(100, {
    message:
      'El segundo nombre debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  secondName?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsDefined({ message: 'El correo electrónico es obligatorio.' })
  @IsString({ message: 'El correo electrónico debe ser texto.' })
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
    { message: 'El correo electrónico debe tener un formato válido.' },
  )
  @MaxUtf8Bytes(150, {
    message: 'El correo electrónico no puede superar 150 bytes en UTF-8.',
  })
  email?: string;
}

export class UpdateClientDto extends UpdateUserBaseDto {
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(optionalName)
  @IsString({ message: 'El primer apellido debe ser texto.' })
  @MaxUtf8Bytes(100, {
    message:
      'El primer apellido debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  firstSurname?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(optionalName)
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @MaxUtf8Bytes(100, {
    message:
      'El segundo apellido debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  secondSurname?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString({ message: 'El número de celular debe ser texto.' })
  @CostaRicaMobile()
  phoneNumber?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsObject({ message: 'La dirección debe ser un objeto válido.' })
  @ValidateNested()
  @Type(() => UpdateAddressDto)
  address?: UpdateAddressDto | null;
}

export class UpdateEmployeeDto extends UpdateUserBaseDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDefined({ message: 'Selecciona una sucursal.' })
  @IsInt({ message: 'La sucursal debe ser un número entero.' })
  @Min(1, { message: 'Selecciona una sucursal válida.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'La sucursal está fuera del rango admitido.',
  })
  branchId?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined({ message: 'El primer apellido es obligatorio.' })
  @IsString({ message: 'El primer apellido debe ser texto.' })
  @Matches(/\S/u, { message: 'El primer apellido no puede estar vacío.' })
  @MaxUtf8Bytes(100, {
    message:
      'El primer apellido debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  firstSurname?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined({ message: 'El segundo apellido es obligatorio.' })
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @Matches(/\S/u, { message: 'El segundo apellido no puede estar vacío.' })
  @MaxUtf8Bytes(100, {
    message:
      'El segundo apellido debe ser texto válido y no superar 100 bytes en UTF-8.',
  })
  secondSurname?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDefined({ message: 'El número de celular es obligatorio.' })
  @IsString({ message: 'El número de celular debe ser texto.' })
  @CostaRicaMobile()
  phoneNumber?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDefined({ message: 'La dirección es obligatoria.' })
  @IsObject({ message: 'La dirección debe ser un objeto válido.' })
  @ValidateNested()
  @Type(() => UpdateAddressDto)
  address?: UpdateAddressDto;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDefined({ message: 'El rol es obligatorio.' })
  @IsIn([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR], {
    message: 'El rol debe ser Empleado o Administrador.',
  })
  role?: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
}

export interface UpdatedUserDto {
  id: number;
  email: string;
  role: UserRole;
}

export type UserEditOptionsDto = Omit<UserCreationOptionsDto, 'branches'>;
