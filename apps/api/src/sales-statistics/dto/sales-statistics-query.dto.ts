import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DateOnly } from '../../common/validation/date-only.decorator';

const toInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;

export class SalesStatisticsQueryDto {
  @DateOnly({}, { message: 'Selecciona una fecha de inicio válida.' })
  dateFrom: string;

  @DateOnly({}, { message: 'Selecciona una fecha de fin válida.' })
  dateTo: string;

  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'Ingresa una edad inicial en años completos.' })
  @Min(0, { message: 'La edad inicial no puede ser negativa.' })
  @Max(9999, { message: 'Ingresa una edad inicial válida.' })
  minAge?: number;

  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'Ingresa una edad final en años completos.' })
  @Min(0, { message: 'La edad final no puede ser negativa.' })
  @Max(9999, { message: 'Ingresa una edad final válida.' })
  maxAge?: number;
}
