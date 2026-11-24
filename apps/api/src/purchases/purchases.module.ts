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
import { TicketEmailRepository } from './ticket-email.repository';
import { TicketEmailService } from './ticket-email.service';
import { TicketEmailSender } from './notifications/ticket-email-sender';
import { SmtpTicketEmailSender } from './notifications/smtp-ticket-email-sender';
import { CardPaymentGateway } from './payments/card-payment.gateway';
import { StripeCardPaymentGateway } from './payments/stripe-card-payment.gateway';
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
    TicketEmailRepository,
    TicketEmailService,
    { provide: TicketEmailSender, useClass: SmtpTicketEmailSender },
    { provide: CardPaymentGateway, useClass: StripeCardPaymentGateway },
  ],
})
export class PurchasesModule {}
