import { createHash, randomUUID } from 'node:crypto';
import {
  guestPurchaseCode,
  guestPurchaseId,
  matchesGuestPurchaseCode,
  normalizeGuestPurchaseCode,
} from './guest-purchase-access';

describe('Private guest purchase codes', () => {
  const key = randomUUID();
  it('derives a stable code without revealing the random request key or personal data', () => {
    const code = guestPurchaseCode(12, key);
    expect(code).toMatch(/^12\.[0-7][0-9A-HJKMNP-TV-Z]{25}$/u);
    expect(code).toHaveLength(29);
    expect(code).not.toContain(key);
    expect(guestPurchaseCode(12, key)).toBe(code);
    expect(guestPurchaseId(code)).toBe(12);
    expect(matchesGuestPurchaseCode(code.toUpperCase(), 12, key)).toBe(true);
    expect(matchesGuestPurchaseCode(code, 12, randomUUID())).toBe(false);
    expect(matchesGuestPurchaseCode(code, 13, key)).toBe(false);
    expect(matchesGuestPurchaseCode('short', 12, key)).toBe(false);
  });
  it('matches an independently calculated 128-bit encoding and accepts grouped lowercase input', () => {
    const knownKey = 'b801323b-9057-460b-b6ab-a36aa4e9b7d2';
    const code = '12.4AVG75NWK52Z476W4QDMW7DYQE';
    expect(guestPurchaseCode(12, knownKey)).toBe(code);
    expect(
      matchesGuestPurchaseCode(
        ' 12.4avg-75nw k52z476w4qdmw7dyqe ',
        12,
        knownKey,
      ),
    ).toBe(true);
    expect(normalizeGuestPurchaseCode('12.olio' + '0'.repeat(22))).toBe(
      '12.0110' + '0'.repeat(22),
    );
  });
  it('continues verifying previously issued full-length codes', () => {
    const digest = createHash('sha256')
      .update(`cinetadel:guest-purchase:v1:12:${key}`)
      .digest('hex');
    const legacy = `INV-12-${digest}`;
    expect(guestPurchaseId(legacy)).toBe(12);
    expect(matchesGuestPurchaseCode(legacy.toLowerCase(), 12, key)).toBe(true);
    expect(matchesGuestPurchaseCode(legacy, 12, randomUUID())).toBe(false);
  });
  it.each([
    '',
    'ORD-000012',
    '12',
    'guest@example.com',
    'INV-0-' + 'a'.repeat(64),
    'INV-9007199254740992-' + 'a'.repeat(64),
    '9007199254740992.' + '0'.repeat(26),
    '12.8' + '0'.repeat(25),
  ])('rejects invalid identifiers: %s', (code) => {
    expect(guestPurchaseId(code)).toBeNull();
  });
});
