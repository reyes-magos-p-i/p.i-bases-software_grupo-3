import { describe, it, expect } from 'vitest'
import { validPurchaseDiscount } from '@/utils/purchase-response'
describe('purchase discount snapshot validation', () => {
  const discount = {
    promotion: {
      promotionId: 9,
      promotionTitle: 'Oferta',
      promotionType: 'fixed',
      promotionAmount: 500,
    },
    originalTotal: 6000,
    discountTotal: 1000,
  }
  it('accepts legacy metadata omission and valid per-ticket totals', () => {
    expect(validPurchaseDiscount(undefined, 6000)).toBe(true)
    expect(validPurchaseDiscount(discount, 5000)).toBe(true)
  })
  it.each([
    null,
    {},
    { ...discount, originalTotal: NaN },
    { ...discount, discountTotal: -1 },
    { ...discount, promotion: { ...discount.promotion, promotionAmount: 4001 } },
    { ...discount, promotion: { ...discount.promotion, promotionId: 0 } },
  ])('rejects invalid snapshots: %p', (snapshot) => {
    expect(validPurchaseDiscount(snapshot, 5000)).toBe(false)
  })
  it('rejects a snapshot inconsistent with the charged amount', () => {
    expect(validPurchaseDiscount(discount, 6000)).toBe(false)
  })
})
