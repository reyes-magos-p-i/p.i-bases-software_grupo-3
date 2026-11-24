import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GuestPurchasesService } from './guest-purchases.service';
import { PurchasesService } from './purchases.service';
import type { PurchaseCatalogRepository } from './purchase-catalog.repository';
import type { PurchasesRepository } from './purchases.repository';
import type { TicketEmailService } from './ticket-email.service';
import type { CardPaymentGateway } from './payments/card-payment.gateway';
describe('PurchasesService', () => {
  const catalog = {
      getMovie: jest.fn(),
      getFunctions: jest.fn(),
      getFunction: jest.fn(),
      getSeats: jest.fn(),
    },
    purchases = { confirm: jest.fn(), list: jest.fn(), findOne: jest.fn() };
  const emails = { status: jest.fn(), request: jest.fn() };
  const payments = {
    createIntent: jest.fn(),
    settled: jest.fn(),
    refund: jest.fn(),
  };
  const service = new PurchasesService(
    catalog as unknown as PurchaseCatalogRepository,
    purchases as unknown as PurchasesRepository,
    emails as unknown as TicketEmailService,
    payments as unknown as CardPaymentGateway,
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
    const requestKey = '6f1f1a52-9c7e-4a51-9f57-1e2a2c3d4e5f';
    const data = {
      requestKey,
      paymentMethod: 'CARD',
      paymentIntentId: 'pi_1',
    } as never;
    payments.settled.mockResolvedValue({ currency: 'crc', requestKey });
    purchases.confirm.mockResolvedValue({ id: 5 });
    purchases.list.mockResolvedValue({ items: [] });
    purchases.findOne.mockResolvedValue({ id: 5 });
    expect(await service.confirm(8, data)).toEqual({ id: 5 });
    expect(await service.list(8, { page: 2 })).toEqual({ items: [] });
    expect(await service.findOne(8, 5)).toEqual({ id: 5 });
    expect(purchases.confirm).toHaveBeenCalledWith(8, data, expect.anything());
    expect(purchases.list).toHaveBeenCalledWith(8, { page: 2 });
    expect(purchases.findOne).toHaveBeenCalledWith(5, 8);
  });
  describe('card payments', () => {
    const requestKey = '6f1f1a52-9c7e-4a51-9f57-1e2a2c3d4e5f';
    const paymentIntentId = 'pi_123ABC';
    const base = {
      functionId: 3,
      seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      requestKey,
      quoteVersion: 'a'.repeat(64),
    };
    const settlement = {
      intentId: paymentIntentId,
      livemode: false,
      amount: 500000,
      currency: 'crc',
      requestKey,
      brand: 'visa',
      last4: '4242',
    };

    it('creates the intent for the server-side quote total', async () => {
      jest.spyOn(service, 'quote').mockResolvedValue({
        total: 5000,
        version: base.quoteVersion,
      } as never);
      payments.createIntent.mockResolvedValue({ intentId: paymentIntentId });

      await expect(service.cardIntent(base)).resolves.toEqual({
        intentId: paymentIntentId,
      });
      expect(payments.createIntent).toHaveBeenCalledWith({
        amount: 5000,
        requestKey,
        quoteVersion: base.quoteVersion,
        functionId: 3,
      });
    });

    it('rejects an intent when the quote changed', async () => {
      jest
        .spyOn(service, 'quote')
        .mockResolvedValue({ total: 5000, version: 'b'.repeat(64) } as never);

      await expect(service.cardIntent(base)).rejects.toMatchObject({
        status: 409,
      });
      expect(payments.createIntent).not.toHaveBeenCalled();
    });

    it('passes the verified settlement to the repository', async () => {
      payments.settled.mockResolvedValue(settlement);
      purchases.confirm.mockResolvedValue({ id: 1 });

      await service.confirm(8, {
        ...base,
        paymentMethod: 'CARD',
        paymentIntentId,
      });

      expect(purchases.confirm).toHaveBeenCalledWith(
        8,
        expect.anything(),
        settlement,
      );
    });

    describe('refunds after a captured payment', () => {
      const confirmation = {
        ...base,
        paymentMethod: 'CARD' as const,
        paymentIntentId,
      };
      const conflict = (code: string) =>
        new ConflictException({ code, message: 'conflict' });

      it.each([
        'SEATS_UNAVAILABLE',
        'QUOTE_CHANGED',
        'PAYMENT_MISMATCH',
        'FUNCTION_UNAVAILABLE',
        'TICKET_LIMIT_REACHED',
      ])('refunds the intent on %s', async (code) => {
        payments.settled.mockResolvedValue(settlement);
        purchases.confirm.mockRejectedValue(conflict(code));

        await expect(service.confirm(8, confirmation)).rejects.toMatchObject({
          response: { code },
        });
        expect(payments.refund).toHaveBeenCalledWith(paymentIntentId);
      });

      it('keeps the charge when the purchase is only busy', async () => {
        payments.settled.mockResolvedValue(settlement);
        purchases.confirm.mockRejectedValue(conflict('PURCHASE_BUSY'));

        await expect(service.confirm(8, confirmation)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(payments.refund).not.toHaveBeenCalled();
      });

      it('keeps the charge on server errors and unrelated conflicts', async () => {
        payments.settled.mockResolvedValue(settlement);
        purchases.confirm.mockRejectedValueOnce(
          new ServiceUnavailableException(),
        );
        purchases.confirm.mockRejectedValueOnce(
          new ConflictException('reused'),
        );
        purchases.confirm.mockRejectedValueOnce(new Error('boom'));

        for (let i = 0; i < 3; i++)
          await expect(service.confirm(8, confirmation)).rejects.toThrow();
        expect(payments.refund).not.toHaveBeenCalled();
      });

      it('does not refund when the payment itself was not verified', async () => {
        payments.settled.mockResolvedValue(null);

        await expect(service.confirm(8, confirmation)).rejects.toThrow();
        expect(payments.refund).not.toHaveBeenCalled();
        expect(purchases.confirm).not.toHaveBeenCalled();
      });

      it('still reports the conflict when the refund fails', async () => {
        payments.settled.mockResolvedValue(settlement);
        purchases.confirm.mockRejectedValue(conflict('SEATS_UNAVAILABLE'));
        payments.refund.mockRejectedValue(new ServiceUnavailableException());
        jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);

        await expect(service.confirm(8, confirmation)).rejects.toMatchObject({
          response: { code: 'SEATS_UNAVAILABLE' },
        });
      });

      it('refunds guest confirmations through the same path', async () => {
        payments.settled.mockResolvedValue(settlement);
        const repository = {
          confirmGuest: jest
            .fn()
            .mockRejectedValue(conflict('SEATS_UNAVAILABLE')),
        };
        const guests = new GuestPurchasesService(
          service,
          repository as unknown as PurchasesRepository,
          {} as never,
          {} as never,
        );
        const buyer = { email: 'a@example.com', confirmEmail: 'a@example.com' };

        await expect(
          guests.confirm({ ...confirmation, buyer } as never),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(payments.refund).toHaveBeenCalledWith(paymentIntentId);
      });
    });

    it('rejects a card confirmation that has not succeeded', async () => {
      payments.settled.mockResolvedValue(null);

      await expect(
        service.cardSettlement({
          ...base,
          paymentMethod: 'CARD',
          paymentIntentId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(purchases.confirm).not.toHaveBeenCalled();
    });

    it('rejects a payment created for a different request', async () => {
      payments.settled.mockResolvedValue({
        ...settlement,
        requestKey: '11111111-1111-4111-8111-111111111111',
      });

      await expect(
        service.cardSettlement({
          ...base,
          paymentMethod: 'CARD',
          paymentIntentId,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
