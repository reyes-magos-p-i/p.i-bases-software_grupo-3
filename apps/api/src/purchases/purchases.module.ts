import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchaseThrottlerGuard } from './purchase-throttler.guard';
@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [
    ClientGuard,
    PurchasesService,
    PurchasesRepository,
    PurchaseCatalogRepository,
    PurchaseThrottlerGuard,
  ],
})
export class PurchasesModule {}
