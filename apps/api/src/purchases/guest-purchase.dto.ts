import { PickType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateUserBaseDto } from '../users/dto/create-user-base.dto';
import { ConfirmPurchaseDto } from './purchase.dto';
import {
  GUEST_PURCHASE_CODE,
  normalizeGuestPurchaseCode,
} from './guest-purchase-access';

export class GuestBuyerDto extends PickType(CreateUserBaseDto, [
  'email',
] as const) {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'Confirma tu correo electrónico.' })
  @MaxLength(150, { message: 'El correo de confirmación es demasiado largo.' })
  confirmEmail: string;
}

export class ConfirmGuestPurchaseDto extends ConfirmPurchaseDto {
  @IsDefined({ message: 'Confirma el correo del comprador antes de pagar.' })
  @IsObject({ message: 'Confirma el correo del comprador antes de pagar.' })
  @ValidateNested()
  @Type(() => GuestBuyerDto)
  buyer: GuestBuyerDto;
}

export class GuestPurchaseLookupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeGuestPurchaseCode(value) : value,
  )
  @IsString({ message: 'El enlace de esta compra no es válido.' })
  @MaxLength(85, { message: 'El enlace de esta compra no es válido.' })
  @Matches(GUEST_PURCHASE_CODE, {
    message:
      'El enlace de esta compra no es válido. Comprueba que esté completo.',
  })
  accessCode: string;
}
