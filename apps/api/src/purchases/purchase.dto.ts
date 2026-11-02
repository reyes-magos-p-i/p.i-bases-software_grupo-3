import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsHash,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { applyDecorators } from '@nestjs/common';
import { MAX_TICKETS_PER_PURCHASE } from './purchase-rules';
function SeatPositions() {
  return applyDecorators(
    IsDefined({ message: 'Completa las categorías de boletos.' }),
    IsArray({ message: 'Selecciona asientos válidos.' }),
    ArrayMaxSize(MAX_TICKETS_PER_PURCHASE, {
      message: `Puedes comprar hasta ${MAX_TICKETS_PER_PURCHASE} boletos por función.`,
    }),
    ArrayUnique({ message: 'Un asiento no puede repetirse.' }),
    IsInt({ each: true, message: 'Selecciona asientos válidos.' }),
    Min(1, { each: true, message: 'Selecciona asientos válidos.' }),
    Max(10000, { each: true, message: 'Selecciona asientos válidos.' }),
  );
}
export class SeatSelectionDto {
  @SeatPositions() GENERAL: number[];
  @SeatPositions() CHILD: number[];
  @SeatPositions() SENIOR: number[];
}
export class PurchaseSelectionDto {
  @IsInt({ message: 'Selecciona una función válida.' })
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  functionId: number;
  @IsDefined({ message: 'Selecciona al menos un asiento.' })
  @IsObject()
  @ValidateNested()
  @Type(() => SeatSelectionDto)
  seats: SeatSelectionDto;
}
export class ConfirmPurchaseDto extends PurchaseSelectionDto {
  @IsUUID('4', {
    message: 'La referencia de la solicitud no es válida. Reinicia la compra.',
  })
  requestKey: string;
  @IsHash('sha256', { message: 'Actualiza el resumen antes de pagar.' })
  quoteVersion: string;
}
const DATE_MESSAGE = 'Introduce una fecha válida (AAAA-MM-DD).';
export class ListPurchasesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page: number = 1;
  // Part of the order number: "0122" finds ORD-000122.
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser texto.' })
  @MaxLength(20, { message: 'La búsqueda no puede superar 20 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
  // Purchase dates, inclusive, in Costa Rica time.
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateFrom?: string;
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: DATE_MESSAGE })
  dateTo?: string;
}
