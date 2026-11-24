import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PromotionsService } from '../promotions/promotions.service';
import type { ApplicablePromotion } from '../promotions/promotion-response.types';
import { PurchasesService } from './purchases.service';
import type { PurchaseCatalogRepository } from './purchase-catalog.repository';
import type { PurchasesRepository } from './purchases.repository';
import type { TicketEmailService } from './ticket-email.service';
describe('PurchasesService', () => {
  const catalog = {
      getMovie: jest.fn(),
      getFunctions: jest.fn(),
      getFunction: jest.fn(),
      getSeats: jest.fn(),
    },
    purchases = { confirm: jest.fn(), list: jest.fn(), findOne: jest.fn() };
  const promotions = { findApplicableToMovieFunction: jest.fn(), resolveForPurchase: jest.fn() };
  const emails = { status: jest.fn(), request: jest.fn() };
  const service = new PurchasesService(
    catalog as unknown as PurchaseCatalogRepository,
    purchases as unknown as PurchasesRepository,
    emails as unknown as TicketEmailService,
    promotions as unknown as PromotionsService,
  );
  beforeEach(() => jest.resetAllMocks());
  it('checks ownership before querying or requesting a ticket email', async () => {
    const receipt = { id: 5 };
    purchases.findOne.mockResolvedValue(receipt);
    emails.status.mockResolvedValue({ status: 'SENT' });
    emails.request.mockResolvedValue({ status: 'PENDING' });
    await expect(service.emailStatus(8, 5)).resolves.toEqual({
      status: 'SENT',
    });
    await expect(service.resendTickets(8, 5)).resolves.toEqual({
      status: 'PENDING',
    });
    expect(emails.status).toHaveBeenCalledWith(receipt);
    expect(emails.request).toHaveBeenCalledWith(receipt, 8);
    purchases.findOne.mockRejectedValue(new Error('not owned'));
    await expect(service.resendTickets(9, 5)).rejects.toThrow('not owned');
    expect(emails.request).toHaveBeenCalledTimes(1);
  });
  it('returns the movie and its current functions or a missing movie error', async () => {
    catalog.getMovie
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce(null);
    catalog.getFunctions.mockResolvedValue([]);
    expect(await service.movieFunctions(2)).toEqual({
      movie: { id: 2 },
      functions: [],
    });
    await expect(service.movieFunctions(9)).rejects.toThrow(
      'La película no existe',
    );
  });
  it('refuses unavailable functions before consulting physical seats', async () => {
    catalog.getFunction.mockResolvedValue(null);
    await expect(service.seats(4)).rejects.toThrow('La función');
    expect(catalog.getSeats).not.toHaveBeenCalled();
  });
  it('refuses a quote above the configured tickets per function', async () => {
    const context = { id: 4, available: true };
    catalog.getFunction.mockResolvedValue(context);
    catalog.getSeats.mockResolvedValue({
      function: context,
      seats: [],
      maxTickets: 1,
    });
    await expect(
      service.quote({
        functionId: 4,
        seats: { GENERAL: [1, 2], CHILD: [], SENIOR: [] },
      }),
    ).rejects.toMatchObject({ response: { code: 'TICKET_LIMIT_REACHED' } });
  });
  it('quotes available seats with authoritative prices', async () => {
    const context = {
      id: 4,
      available: true,
      format: '2D',
      technology: 'STANDARD',
      isPremiere: false,
    };
    catalog.getFunction.mockResolvedValue(context);
    catalog.getSeats.mockResolvedValue({
      function: context,
      seats: [{ positionId: 1, state: 'free', type: 'normal' }],
    });
    expect(
      await service.quote({
        functionId: 4,
        seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      }),
    ).toMatchObject({ total: 3000, quantity: 1 });
    expect(catalog.getSeats).toHaveBeenCalledWith(context);
  });
  it('always passes the authenticated owner to storage', async () => {
    const data = {} as never;
    purchases.confirm.mockResolvedValue({ id: 5 });
    purchases.list.mockResolvedValue({ items: [] });
    purchases.findOne.mockResolvedValue({ id: 5 });
    expect(await service.confirm(8, data)).toEqual({ id: 5 });
    expect(await service.list(8, { page: 2 })).toEqual({ items: [] });
    expect(await service.findOne(8, 5)).toEqual({ id: 5 });
    expect(purchases.confirm).toHaveBeenCalledWith(8, data);
    expect(purchases.list).toHaveBeenCalledWith(8, { page: 2 });
    expect(purchases.findOne).toHaveBeenCalledWith(5, 8);
  });
  describe('availablePromotions', () => {
    const matching: ApplicablePromotion = {
      promotionId: 42, promotionTitle: 'Oferta', promotionType: 'percentage', promotionAmount: 25,
      description: 'Descuento', conditions: null, posterPath: null,
      beginDate: '2026-01-01', endDate: '2026-12-31', beginHour: null, endHour: null,
      projectionFormat: null, technology: null,
    };
    it('checks function availability before returning all eligible promotions unchanged', async () => {
      const rows = [matching, { ...matching, promotionId: 43, promotionType: 'fixed' as const, promotionAmount: 500 }];
      catalog.getFunction.mockResolvedValueOnce({ id: 4, available: true });
      promotions.findApplicableToMovieFunction.mockResolvedValueOnce(rows);
      await expect(service.availablePromotions(4)).resolves.toBe(rows);
      expect(catalog.getFunction).toHaveBeenCalledWith(4);
      expect(promotions.findApplicableToMovieFunction).toHaveBeenCalledTimes(1);
      expect(promotions.findApplicableToMovieFunction).toHaveBeenCalledWith(4);
      expect(catalog.getFunction.mock.invocationCallOrder[0]).toBeLessThan(promotions.findApplicableToMovieFunction.mock.invocationCallOrder[0]);
      expect(catalog.getSeats).not.toHaveBeenCalled();
      expect(purchases.confirm).not.toHaveBeenCalled();
    });
    it('returns an empty list when no promotions match an available function', async () => {
      catalog.getFunction.mockResolvedValueOnce({ id: 4, available: true });
      promotions.findApplicableToMovieFunction.mockResolvedValueOnce([]);
      await expect(service.availablePromotions(4)).resolves.toEqual([]);
    });
    it.each([null, { id: 4, available: false }])('uses the existing unavailable-function rule for %p', async (context) => {
      catalog.getFunction.mockResolvedValueOnce(context);
      await expect(service.availablePromotions(4)).rejects.toBeInstanceOf(ConflictException);
      expect(promotions.findApplicableToMovieFunction).not.toHaveBeenCalled();
    });
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid function ID %s before reading', async (id) => {
      await expect(service.availablePromotions(id)).rejects.toBeInstanceOf(BadRequestException);
      expect(catalog.getFunction).not.toHaveBeenCalled();
      expect(promotions.findApplicableToMovieFunction).not.toHaveBeenCalled();
    });
    it('waits for the availability lookup before querying promotions', async () => {
      let resolve!: (value: { id: number; available: boolean }) => void;
      catalog.getFunction.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
      promotions.findApplicableToMovieFunction.mockResolvedValueOnce([]);
      const pending = service.availablePromotions(4);
      expect(promotions.findApplicableToMovieFunction).not.toHaveBeenCalled();
      resolve({ id: 4, available: true });
      await expect(pending).resolves.toEqual([]);
    });
    it('preserves a catalog failure and skips the promotion lookup', async () => {
      const error = new Error('Catalog unavailable');
      catalog.getFunction.mockRejectedValueOnce(error);
      await expect(service.availablePromotions(4)).rejects.toBe(error);
      expect(promotions.findApplicableToMovieFunction).not.toHaveBeenCalled();
    });
    it.each([new Error('Promotion database unavailable'), new NotFoundException('Movie function not found.')])(
      'preserves promotion lookup errors instead of returning []: %p', async (error) => {
        catalog.getFunction.mockResolvedValueOnce({ id: 4, available: true });
        promotions.findApplicableToMovieFunction.mockRejectedValueOnce(error);
        await expect(service.availablePromotions(4)).rejects.toBe(error);
      },
    );
  });

});

describe('quote promotion resolution', () => {
  it('uses server promotion information when quoting', async () => {
    const resolveForPurchase = jest.fn().mockResolvedValue({ promotionId: 8, promotionTitle: 'Oferta', promotionType: 'fixed', promotionAmount: 500 });
    const catalog = { getFunction: jest.fn().mockResolvedValue({ available: true }),
      getSeats: jest.fn().mockResolvedValue({ function: { available: true }, seats: [{ positionId: 1, state: 'free', type: 'normal' }], maxTickets: 10 }) };
    const service = new PurchasesService(catalog as never, {} as never, {} as never, { resolveForPurchase } as never);
    expect(await service.quote({ functionId: 4, promotionId: 8, seats: { GENERAL: [1], CHILD: [], SENIOR: [] } })).toMatchObject({ total: 2500 });
    expect(resolveForPurchase).toHaveBeenCalledWith(4, 8);
  });
});
