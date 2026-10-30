import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TRANSACTION_STATUSES,
  type TransactionStatus,
} from './listed-transactions.dto';

export const TRANSACTION_PAGE_SIZES = [10, 20, 50] as const;
const DATE_MESSAGE = 'Introduce una fecha válida (AAAA-MM-DD).';

const toInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;

export class ListTransactionsQueryDto {
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
  @IsInt({ message: 'Selecciona una sucursal de la lista.' })
  @Min(1, { message: 'Selecciona una sucursal de la lista.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'Selecciona una sucursal de la lista.',
  })
  branchId?: number;

  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'Selecciona una película de la lista.' })
  @Min(1, { message: 'Selecciona una película de la lista.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'Selecciona una película de la lista.',
  })
  movieId?: number;

  @IsOptional()
  @IsIn(TRANSACTION_STATUSES, { message: 'Selecciona un estado de la lista.' })
  status?: TransactionStatus;

  // Purchase dates, inclusive, in Costa Rica time.
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateTo?: string;

  @Transform(toInteger)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser un número entero positivo.' })
  @Max(1000000, { message: 'La página está fuera del rango admitido.' })
  page = 1;

  @Transform(toInteger)
  @IsIn(TRANSACTION_PAGE_SIZES, {
    message: 'El tamaño de página debe ser 10, 20 o 50.',
  })
  pageSize = 10;
}
