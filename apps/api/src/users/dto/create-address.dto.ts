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
  @IsDefined({ message: 'Selecciona un distrito.' })
  @IsInt({
    message: 'Selecciona un distrito válido.',
  })
  @Min(1, {
    message: 'Selecciona un distrito válido.',
  })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'Selecciona un distrito válido.',
  })
  districtId: number;

  @IsOptional()
  @IsString({ message: 'El detalle de la dirección debe ser texto.' })
  @MaxUtf8Bytes(255, {
    message: 'El detalle de la dirección es demasiado largo. Acórtalo.',
  })
  details?: string | null;
}
