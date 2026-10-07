import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ToInteger } from './query-transforms';

export class AvailableMoviesQueryDto {
  @ToInteger()
  @IsInt({ message: 'Selecciona una sucursal válida.' })
  @Min(1, { message: 'Selecciona una sucursal válida.' })
  branchId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda admite como máximo 100 caracteres.' })
  search?: string;
}
