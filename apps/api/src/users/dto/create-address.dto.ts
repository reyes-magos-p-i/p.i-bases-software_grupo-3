import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';

export class CreateAddressDto {
  @IsDefined({ message: 'El identificador del distrito es obligatorio.' })
  @IsInt({
    message: 'El identificador del distrito debe ser un número entero.',
  })
  @Min(Number.MIN_SAFE_INTEGER, {
    message: 'El identificador del distrito está fuera del rango admitido.',
  })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'El identificador del distrito está fuera del rango admitido.',
  })
  districtId: number;

  @IsOptional()
  @IsString({ message: 'El detalle de la dirección debe ser texto.' })
  @MaxUtf8Bytes(255)
  details?: string | null;
}
