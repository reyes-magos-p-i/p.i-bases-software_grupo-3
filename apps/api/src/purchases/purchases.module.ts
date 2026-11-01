import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [
    ClientGuard,
    PurchasesService,
    PurchasesRepository,
    PurchaseCatalogRepository,
    {
      provide: ThrottlerGuard,
      inject: [getStorageToken(), Reflector],
      useFactory: (storage: ThrottlerStorage, reflector: Reflector) =>
        new ThrottlerGuard(
          {
            throttlers: [{ ttl: 60000, limit: 10 }],
            errorMessage:
              'Has realizado demasiadas solicitudes de compra. Espera un minuto e intenta nuevamente.',
          },
          storage,
          reflector,
        ),
    },
  ],
})
export class PurchasesModule {}
