import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardPaymentGateway } from './payments/card-payment.gateway';
import type {
  CardIntent,
  CardSettlement,
} from './payments/card-payment.gateway';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchasesRepository } from './purchases.repository';
import { TicketEmailService } from './ticket-email.service';
import {
  purchaseQuote,
  requireAvailableFunction,
  requireTicketAllowance,
  selectionPositions,
} from './purchase-rules';
import type {
  ConfirmPurchaseDto,
  ListPurchasesQueryDto,
  PurchaseIntentDto,
  PurchaseSelectionDto,
} from './purchase.dto';
@Injectable()
export class PurchasesService {
  constructor(
    private readonly catalog: PurchaseCatalogRepository,
    private readonly purchases: PurchasesRepository,
    private readonly emails: TicketEmailService,
    private readonly payments: CardPaymentGateway,
  ) {}
  async movieFunctions(movieId: number) {
    const movie = await this.catalog.getMovie(movieId);
    if (!movie) throw new NotFoundException('La película no existe.');
    return { movie, functions: await this.catalog.getFunctions(movieId) };
  }
  async seats(id: number) {
    const context = await this.catalog.getFunction(id);
    requireAvailableFunction(context);
    return this.catalog.getSeats(context);
  }
  async quote(data: PurchaseSelectionDto) {
    const result = await this.seats(data.functionId);
    requireTicketAllowance(
      0,
      selectionPositions(data).length,
      result.maxTickets,
    );
    return purchaseQuote(result.function, result.seats, data);
  }
  // Creates the card payment for a quoted selection. The amount comes from the
  // server-side quote, never from the client.
  async cardIntent(data: PurchaseIntentDto): Promise<CardIntent> {
    const quote = await this.quote(data);
    if (quote.version !== data.quoteVersion)
      throw new ConflictException({
        code: 'QUOTE_CHANGED',
        message:
          'Los datos o el precio de la función cambiaron. Revisa el resumen actualizado antes de pagar.',
      });
    return this.payments.createIntent({
      amount: quote.total,
      requestKey: data.requestKey,
      quoteVersion: quote.version,
      functionId: data.functionId,
    });
  }

  // Returns the verified card payment for a confirmation. The intent must
  // have succeeded and belong to this request.
  async cardSettlement(data: ConfirmPurchaseDto): Promise<CardSettlement> {
    const settlement = await this.payments.settled(data.paymentIntentId);
    if (
      !settlement ||
      settlement.currency !== 'crc' ||
      settlement.requestKey !== data.requestKey
    )
      throw new BadRequestException(
        'El pago no fue aprobado. Intenta con otra tarjeta.',
      );
    return settlement;
  }

  async confirm(clientId: number, data: ConfirmPurchaseDto) {
    return this.purchases.confirm(
      clientId,
      data,
      await this.cardSettlement(data),
    );
  }
  list(clientId: number, query: ListPurchasesQueryDto) {
    return this.purchases.list(clientId, query);
  }
  findOne(clientId: number, id: number) {
    return this.purchases.findOne(id, clientId);
  }
  async emailStatus(clientId: number, id: number) {
    return this.emails.status(await this.findOne(clientId, id));
  }
  async resendTickets(clientId: number, id: number) {
    return this.emails.request(await this.findOne(clientId, id), clientId);
  }
}
