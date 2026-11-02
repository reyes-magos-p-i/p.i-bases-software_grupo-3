import { randomUUID } from 'node:crypto';
import {
  guestPurchaseCode,
  guestPurchaseId,
  matchesGuestPurchaseCode,
} from './guest-purchase-access';

describe('Private guest purchase codes', () => {
  const key = randomUUID();
  it('derives a stable code without revealing the random request key or personal data', () => {
    const code = guestPurchaseCode(12, key);
    expect(code).toMatch(/^INV-12-[a-f0-9]{64}$/u);
    expect(code).not.toContain(key);
    expect(guestPurchaseCode(12, key)).toBe(code);
    expect(guestPurchaseId(code)).toBe(12);
    expect(matchesGuestPurchaseCode(code.toUpperCase(), 12, key)).toBe(true);
    expect(matchesGuestPurchaseCode(code, 12, randomUUID())).toBe(false);
    expect(matchesGuestPurchaseCode(code, 13, key)).toBe(false);
    expect(matchesGuestPurchaseCode('short', 12, key)).toBe(false);
  });
  it.each([
    '',
    'ORD-000012',
    '12',
    'guest@example.com',
    'INV-0-' + 'a'.repeat(64),
    'INV-9007199254740992-' + 'a'.repeat(64),
  ])('rejects invalid identifiers: %s', (code) => {
    expect(guestPurchaseId(code)).toBeNull();
  });
});
