import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PurchaseThrottlerGuard extends ThrottlerGuard {
  protected override getErrorMessage(): Promise<string> {
    return Promise.resolve(
      'Has realizado demasiadas solicitudes de compra. Espera un minuto e intenta nuevamente.',
    );
  }
}
