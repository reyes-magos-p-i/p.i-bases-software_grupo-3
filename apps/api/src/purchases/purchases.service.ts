import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
// Conflicts that leave a captured payment without tickets. PURCHASE_BUSY and
// server errors are not listed: the web retries those with the same intent.
const REFUNDABLE_CODES = new Set([
  'SEATS_UNAVAILABLE',
  'QUOTE_CHANGED',
  'PAYMENT_MISMATCH',
  'FUNCTION_UNAVAILABLE',
  'TICKET_LIMIT_REACHED',
]);
function refundable(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    REFUNDABLE_CODES.has((response as { code?: string }).code ?? '')
  );
}
@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);
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

  // Verifies the card payment, then saves the purchase. The payment is already
  // captured at this point, so a conflict that leaves it without tickets
  // refunds it.
  async confirmPaid<T>(
    data: ConfirmPurchaseDto,
    save: (settlement: CardSettlement) => Promise<T>,
  ): Promise<T> {
    const settlement = await this.cardSettlement(data);
    try {
      return await save(settlement);
    } catch (error) {
      if (refundable(error)) await this.refund(settlement.intentId);
      throw error;
    }
  }

  private async refund(intentId: string) {
    try {
      await this.payments.refund(intentId);
    } catch (failure) {
      // The conflict is what the buyer needs to see; the charge needs manual follow-up.
      this.logger.error(
        `Refund of ${intentId} failed after a purchase conflict.`,
        failure instanceof Error ? failure.stack : undefined,
      );
    }
  }

  confirm(clientId: number, data: ConfirmPurchaseDto) {
    return this.confirmPaid(data, (settlement) =>
      this.purchases.confirm(clientId, data, settlement),
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
