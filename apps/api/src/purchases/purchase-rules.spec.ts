import type { ConflictException } from '@nestjs/common';
import {
  purchaseQuote,
  purchaseQrPayload,
  requireAvailableFunction,
  requireGuestEmailAvailable,
  selectionHash,
  selectionPositions,
  requireTicketAllowance,
  requireGuestPurchaseAllowance,
} from './purchase-rules';
import type { PurchaseFunction, PurchaseSeat } from './purchase.types';
it('keeps the transaction QR stable and free of guest access credentials', () => {
  const payload = purchaseQrPayload('ORD-000012');
  expect(JSON.parse(payload)).toEqual({
    type: 'CINETADEL_PURCHASE',
    version: 1,
    reference: 'ORD-000012',
  });
  expect(purchaseQrPayload('ORD-000012')).toBe(payload);
  expect(purchaseQrPayload('ORD-000013')).not.toBe(payload);
});
const context: PurchaseFunction = {
  id: 4,
  movieId: 2,
  title: 'Película',
  synopsis: 'Historia',
  posterImage: '',
  branchId: 1,
  branchName: 'Cine',
  theaterId: 3,
  rows: 2,
  columns: 2,
  startsAt: '2099-01-01T20:00:00-06:00',
  endsAt: '2099-01-01T22:00:00-06:00',
  status: 'ACTIVE',
  available: true,
  format: '3D',
  technology: 'IMAX',
  isPremiere: true,
  price: 5000,
};
const seats: PurchaseSeat[] = [1, 2, 3, 4].map((positionId) => ({
  positionId,
  theaterId: 3,
  rowNumber: Math.ceil(positionId / 2),
  columnNumber: ((positionId - 1) % 2) + 1,
  type: positionId === 2 ? 'vip' : 'normal',
  state: 'free',
}));
const selection = {
  functionId: 4,
  seats: { GENERAL: [1, 2], CHILD: [3], SENIOR: [4] },
};
describe('Purchase rules', () => {
  it('allows an email only when no client account exists', () => {
    expect(() => requireGuestEmailAvailable(null)).not.toThrow();
  });
  it.each([
    ['ACTIVE', false, 'CLIENT_LOGIN_REQUIRED', 'Inicia sesión'],
    ['ACTIVE', true, 'CLIENT_VERIFICATION_REQUIRED', 'Confirma tu correo'],
    ['INACTIVE', false, 'CLIENT_ACCOUNT_INACTIVE', 'reactivación'],
    ['INACTIVE', true, 'CLIENT_ACCOUNT_INACTIVE', 'reactivación'],
  ] as const)(
    'rejects %s accounts with pending verification %s consistently',
    (status, verificationPending, code, message) => {
      expect(() =>
        requireGuestEmailAvailable({ status, verificationPending }),
      ).toThrow(
        expect.objectContaining({
          response: { code, message: expect.stringContaining(message) },
          status: 409,
        }),
      );
    },
  );
  it('quotes mixed age and VIP tickets without trusting a client price', () => {
    const quote = purchaseQuote(context, seats, selection);
    expect(quote.quantity).toBe(4);
    expect(quote.total).toBe(20000);
    expect(quote.lines.map((line) => line.subtotal)).toEqual([
      5000, 6000, 4500, 4500,
    ]);
    expect(quote.version).toMatch(/^[a-f0-9]{64}$/u);
  });
  it('keeps the version stable for the same selection in another order', () => {
    const reversed = {
      ...selection,
      seats: { ...selection.seats, GENERAL: [2, 1] },
    };
    expect(selectionHash(reversed)).toBe(selectionHash(selection));
    expect(purchaseQuote(context, [...seats].reverse(), reversed).version).toBe(
      purchaseQuote(context, seats, selection).version,
    );
  });
  it('changes the version after a schedule, price, category or physical seat type change', () => {
    const version = purchaseQuote(context, seats, selection).version;
    expect(
      purchaseQuote({ ...context, isPremiere: false }, seats, selection)
        .version,
    ).not.toBe(version);
    expect(
      purchaseQuote(
        { ...context, endsAt: '2099-01-01T23:00:00-06:00' },
        seats,
        selection,
      ).version,
    ).not.toBe(version);
    expect(
      purchaseQuote(
        context,
        seats.map((seat) => ({ ...seat, type: 'normal' })),
        selection,
      ).version,
    ).not.toBe(version);
  });
  it('rejects unavailable, missing, reserved and occupied seats', () => {
    for (const state of ['unavailable', 'reserved', 'in-use'] as const)
      expect(() =>
        purchaseQuote(
          context,
          seats.map((seat) =>
            seat.positionId === 1 ? { ...seat, state } : seat,
          ),
          selection,
        ),
      ).toThrow('Algunos asientos');
    expect(() => purchaseQuote(context, seats.slice(1), selection)).toThrow(
      'Algunos asientos',
    );
  });
  it('rejects a function that is no longer available', () => {
    expect(() => requireAvailableFunction(null)).toThrow('La función');
    expect(() =>
      purchaseQuote({ ...context, available: false }, seats, selection),
    ).toThrow('La función');
  });
  it('rejects empty, repeated and excessive selections before storage', () => {
    expect(() =>
      selectionPositions({
        functionId: 4,
        seats: { GENERAL: [], CHILD: [], SENIOR: [] },
      }),
    ).toThrow('Selecciona');
    expect(() =>
      selectionPositions({
        ...selection,
        seats: { GENERAL: [1], CHILD: [1], SENIOR: [] },
      }),
    ).toThrow('repetirse');
    expect(() =>
      selectionPositions({
        ...selection,
        seats: {
          GENERAL: Array.from({ length: 10001 }, (_, i) => i + 1),
          CHILD: [],
          SENIOR: [],
        },
      }),
    ).toThrow('capacidad');
  });
  it('applies the configured tickets per function', () => {
    expect(() => requireTicketAllowance(7, 3, 10)).not.toThrow();
    expect(() => requireTicketAllowance(7, 3, 9)).toThrow(
      'hasta 9 boletos por función. Ya tienes 7',
    );
    expect(() => requireTicketAllowance(0, 3, 2)).toThrow(
      /^Puedes comprar hasta 2 boletos por función\.$/u,
    );
    let failure: unknown;
    try {
      requireTicketAllowance(8, 3, 10);
    } catch (error) {
      failure = error;
    }
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'TICKET_LIMIT_REACHED',
    });
  });
  it('applies the configured guest purchases per hour', () => {
    expect(() => requireGuestPurchaseAllowance(2, 3)).not.toThrow();
    let failure: unknown;
    try {
      requireGuestPurchaseAllowance(3, 3);
    } catch (error) {
      failure = error;
    }
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'GUEST_EMAIL_LIMIT',
    });
  });
});

describe('per-ticket promotions', () => {
  const promotion = { promotionId: 9, promotionTitle: 'Oferta', promotionType: 'fixed' as const, promotionAmount: 500 };
  const data = { ...selection, promotionId: 9 };
  it('subtracts fixed discounts from EACH ticket, including mixed categories and VIP', () => {
    const result = purchaseQuote(context, seats, data, promotion);
    expect(result.total).toBe(18000);
    expect(result.lines.map((line) => line.unitPrice)).toEqual([4500, 5500, 4000, 4000]);
    expect(result.discount).toMatchObject({ originalTotal: 20000, discountTotal: 2000 });
    expect(result.lines.every((line) => line.base + line.modifiers.reduce((sum, item) => sum + item.amount, 0) === line.unitPrice)).toBe(true);
  });
  it('applies percentages to the final per-ticket price including surcharges', () => {
    expect(purchaseQuote(context, seats, data, { ...promotion, promotionType: 'percentage', promotionAmount: 25 }).total).toBe(15000);
  });
  it('never produces negative prices and accepts a 100% promotion', () => {
    const cheap = { ...context, format: '2D' as const, technology: 'STANDARD' as const, isPremiere: false };
    expect(purchaseQuote(cheap, seats, data, { ...promotion, promotionAmount: 4000 }).total).toBe(0);
    expect(purchaseQuote(context, seats, data, { ...promotion, promotionType: 'percentage', promotionAmount: 100 }).total).toBe(0);
  });
  it('rounds per ticket to cents before multiplying quantities', () => {
    const result = purchaseQuote(context, seats, data, { ...promotion, promotionType: 'percentage', promotionAmount: 33.33 });
    expect(result.total).toBe(13334);
  });
  it('binds idempotency to promotion selection while preserving legacy no-promotion hashes', () => {
    expect(selectionHash(data)).not.toBe(selectionHash(selection));
    expect(selectionHash({ ...selection, promotionId: null })).toBe(selectionHash(selection));
    expect(selectionHash({ ...data, promotionId: 10 })).not.toBe(selectionHash(data));
  });
  it('changes quote version when the promotion changes and does not mutate input', () => {
    const before = JSON.stringify({ seats, promotion });
    expect(purchaseQuote(context, seats, data, promotion).version).not.toBe(purchaseQuote(context, seats, data, { ...promotion, promotionAmount: 501 }).version);
    expect(JSON.stringify({ seats, promotion })).toBe(before);
  });
  it('rejects an unresolved selected promotion', () => {
    expect(() => purchaseQuote(context, seats, data)).toThrow();
    expect(() => purchaseQuote(context, seats, selection, promotion)).toThrow();
  });
});
