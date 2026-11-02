import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchaseThrottlerGuard } from './purchase-throttler.guard';
import { ClientsModule } from '../clients/clients.module';
import { GuestPurchasesController } from './guest-purchases.controller';
import { GuestPurchasesService } from './guest-purchases.service';
@Module({
  imports: [AuthModule, ClientsModule],
  controllers: [PurchasesController, GuestPurchasesController],
  providers: [
    ClientGuard,
    PurchasesService,
    PurchasesRepository,
    PurchaseCatalogRepository,
    PurchaseThrottlerGuard,
    GuestPurchasesService,
  ],
})
export class PurchasesModule {}
