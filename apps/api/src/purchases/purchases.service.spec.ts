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
  const emails = { status: jest.fn(), request: jest.fn() };
  const service = new PurchasesService(
    catalog as unknown as PurchaseCatalogRepository,
    purchases as unknown as PurchasesRepository,
    emails as unknown as TicketEmailService,
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
});
