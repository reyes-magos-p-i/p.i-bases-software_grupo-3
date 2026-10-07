import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AvailableMoviesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value,
  )
  @IsInt({ message: 'Selecciona una sucursal válida.' })
  @Min(1, { message: 'Selecciona una sucursal válida.' })
  branchId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda admite como máximo 100 caracteres.' })
  search?: string;
}
