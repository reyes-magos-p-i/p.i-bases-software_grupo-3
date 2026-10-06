import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
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
  @MaxUtf8Bytes(100)
  firstSurname?: string | null;

  @IsOptional()
  @IsString({ message: 'El segundo apellido debe ser texto.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @MaxUtf8Bytes(100)
  secondSurname?: string | null;

  @IsOptional()
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
  @Matches(/\S/u, {
    message: 'El idioma no puede estar vacío ni contener solo espacios.',
  })
  @MaxUtf8Bytes(5)
  language?: string;
}
