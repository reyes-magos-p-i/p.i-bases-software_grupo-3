import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class TransactionIdParamsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value,
  )
  @IsInt({
    message: 'El identificador de la transacción debe ser un número entero.',
  })
  @Min(1, { message: 'El identificador de la transacción debe ser positivo.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: 'El identificador de la transacción está fuera del rango admitido.',
  })
  id: number;
}
