import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsHash,
  IsInt,
  IsObject,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { applyDecorators } from '@nestjs/common';
function SeatPositions() {
  return applyDecorators(
    IsDefined({ message: 'Completa las categorías de boletos.' }),
    IsArray({ message: 'Selecciona asientos válidos.' }),
    ArrayMaxSize(10000, {
      message: 'La selección supera la capacidad máxima de la sala.',
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
export class PurchasePageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page: number = 1;
}
