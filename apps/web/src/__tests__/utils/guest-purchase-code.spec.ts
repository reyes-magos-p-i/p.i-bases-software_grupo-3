import { describe, expect, it } from 'vitest'
import { normalizeGuestPurchaseCode, validGuestPurchaseCode } from '@/utils/guest-purchase-code'
describe('Guest consultation code input', () => {
  it('accepts compact input without ambiguous letters and normalizes grouping and case', () => {
    expect(validGuestPurchaseCode(' 12.4avg-75nw k52z476w4qdmw7dyqe ')).toBe(true)
    expect(normalizeGuestPurchaseCode('12.4avg-75nw k52z476w4qdmw7dyqe')).toBe(
      '12.4AVG75NWK52Z476W4QDMW7DYQE',
    )
    expect(normalizeGuestPurchaseCode('12.olio' + '0'.repeat(22))).toBe('12.0110' + '0'.repeat(22))
  })
  it('keeps previously issued long codes usable', () => {
    expect(validGuestPurchaseCode('inv-12-' + 'a'.repeat(64))).toBe(true)
    expect(normalizeGuestPurchaseCode(' inv-12-' + 'a'.repeat(64) + ' ')).toBe(
      'INV-12-' + 'A'.repeat(64),
    )
  })
  it.each([
    '',
    'ORD-000012',
    '12.short',
    '12.8' + '0'.repeat(25),
    '0.' + '0'.repeat(26),
    '9007199254740992.' + '0'.repeat(26),
  ])('rejects invalid or unsafe codes: %s', (code) => {
    expect(validGuestPurchaseCode(code)).toBe(false)
  })
})
