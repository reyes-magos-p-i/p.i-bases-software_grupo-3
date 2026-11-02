import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  ConfirmGuestPurchaseDto,
  GuestBuyerDto,
  GuestPurchaseLookupDto,
} from './guest-purchase.dto';
import { guestPurchaseCode } from './guest-purchase-access';

describe('Guest purchase input', () => {
  it('reuses email normalization and purchase validation', async () => {
    const dto = plainToInstance(ConfirmGuestPurchaseDto, {
      buyer: {
        email: ' Guest@Example.com ',
        confirmEmail: ' GUEST@example.com ',
      },
      functionId: 4,
      seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      requestKey: randomUUID(),
      quoteVersion: 'a'.repeat(64),
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.buyer.email).toBe('guest@example.com');
    expect(dto.buyer.confirmEmail).toBe(dto.buyer.email);
  });
  it.each([
    {},
    { email: '', confirmEmail: '' },
    { email: 'invalid', confirmEmail: 'invalid' },
    { email: 'guest@example.com', confirmEmail: null },
    { email: 'a'.repeat(151) + '@example.com', confirmEmail: 'a'.repeat(151) },
    { email: 123, confirmEmail: 123 },
    { email: '\ud800@example.com', confirmEmail: 'x' },
  ])('rejects malformed or missing email fields: %j', async (data) => {
    expect(
      (await validate(plainToInstance(GuestBuyerDto, data))).length,
    ).toBeGreaterThan(0);
  });
  it('accepts only a complete consultation code, trimmed without exposing it in URLs', async () => {
    const code = guestPurchaseCode(12, randomUUID());
    const dto = plainToInstance(GuestPurchaseLookupDto, {
      accessCode: ' ' + code + ' ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.accessCode).toBe(code);
    expect(
      (
        await validate(
          plainToInstance(GuestPurchaseLookupDto, { accessCode: 12 }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
