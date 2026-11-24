import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchasesRepository } from './purchases.repository';
import { TicketEmailService } from './ticket-email.service';
import { PromotionsService } from '../promotions/promotions.service';
import type { ApplicablePromotion } from '../promotions/promotion-response.types';
import {
  purchaseQuote,
  requireAvailableFunction,
  requireTicketAllowance,
  selectionPositions,
} from './purchase-rules';
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
    private readonly promotions: PromotionsService,
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
  async availablePromotions(functionId: number): Promise<ApplicablePromotion[]> {
    if (!Number.isSafeInteger(functionId) || functionId < 1) {
      throw new BadRequestException('Selecciona una función válida.');
    }
    const context = await this.catalog.getFunction(functionId);
    requireAvailableFunction(context);
    return this.promotions.findApplicableToMovieFunction(functionId);
  }
  async quote(data: PurchaseSelectionDto) {
    const result = await this.seats(data.functionId);
    requireTicketAllowance(
      0,
      selectionPositions(data).length,
      result.maxTickets,
    );
    return purchaseQuote(result.function, result.seats, data,
      await this.promotions.resolveForPurchase(data.functionId, data.promotionId));
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
