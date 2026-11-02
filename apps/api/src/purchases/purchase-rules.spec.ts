import {
  purchaseQuote,
  purchaseQrPayload,
  requireAvailableFunction,
  requireGuestEmailAvailable,
  selectionHash,
  selectionPositions,
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
});
