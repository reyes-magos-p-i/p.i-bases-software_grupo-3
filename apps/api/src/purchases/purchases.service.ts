import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchasesRepository } from './purchases.repository';
import { TicketEmailService } from './ticket-email.service';
import { purchaseQuote, requireAvailableFunction } from './purchase-rules';
import type {
  ConfirmPurchaseDto,
  ListPurchasesQueryDto,
  PurchaseSelectionDto,
} from './purchase.dto';
@Injectable()
export class PurchasesService {
  constructor(
    private readonly catalog: PurchaseCatalogRepository,
    private readonly purchases: PurchasesRepository,
    private readonly emails: TicketEmailService,
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
    return purchaseQuote(result.function, result.seats, data);
  }
  confirm(clientId: number, data: ConfirmPurchaseDto) {
    return this.purchases.confirm(clientId, data);
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
