import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PROJECTION_STATUSES,
  type ProjectionStatus,
} from '../types/projection.types';
import { ToInteger } from './query-transforms';

export const PROJECTION_PAGE_SIZES = [10, 25, 50, 100] as const;
const DATE_MESSAGE = 'Introduce una fecha válida (AAAA-MM-DD).';
const TIME_MESSAGE = 'Introduce una hora válida (HH:mm).';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u;

export class ListProjectionsQueryDto {
  @IsOptional()
  @ToInteger()
  @IsInt({ message: 'La página debe ser un número entero positivo.' })
  @Min(1, { message: 'La página debe ser un número entero positivo.' })
  page: number = 1;

  @IsOptional()
  @ToInteger()
  @IsIn(PROJECTION_PAGE_SIZES, {
    message: 'El tamaño de página debe ser 10, 25, 50 o 100.',
  })
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda admite como máximo 100 caracteres.' })
  search?: string;

  @IsOptional()
  @IsIn(PROJECTION_STATUSES, { message: 'Selecciona un estado de la lista.' })
  status?: ProjectionStatus;

  @IsOptional()
  @ToInteger()
  @IsInt({ message: 'Selecciona una sucursal de la lista.' })
  branchId?: number;

  @IsOptional()
  @ToInteger()
  @IsInt({ message: 'Selecciona una sala de la lista.' })
  theaterId?: number;

  @IsOptional()
  @ToInteger()
  @IsInt({ message: 'Selecciona una película de la lista.' })
  movieId?: number;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateTo?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  timeFrom?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  timeTo?: string;
}
