import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;

export class ListCinemasQueryDto {
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser texto.' })
  @Matches(/\S/u, { message: 'La búsqueda no puede contener solo espacios.' })
  @Matches(/^[^\p{Cc}]*$/u, {
    message: 'La búsqueda contiene caracteres de control no válidos.',
  })
  @MaxLength(100, { message: 'La búsqueda no puede superar 100 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !/\p{Cc}/u.test(value)
      ? value.trim().replace(/\s+/gu, ' ')
      : value,
  )
  search?: string;

  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'La compañía debe ser un número entero.' })
  @Min(1, { message: 'La compañía debe ser un número positivo.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'La compañía está fuera del rango admitido.',
  })
  companyId?: number;

  @Transform(toInteger)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1)
  @Max(1000000)
  page = 1;

  @Transform(toInteger)
  @IsInt()
  @IsIn([10, 20, 50], {
    message: 'El tamaño de página debe ser 10, 20 o 50.',
  })
  pageSize = 10;
}
