import { describe, expect, it } from 'vitest'
import {
  PurchaseResponseError,
  readPurchaseReceipt,
  readGuestPurchaseReceipt,
} from '@/utils/purchase-response'
const receipt = {
  id: 12,
  reference: 'ORD-000012',
  purchasedAt: '2026-11-01T12:00:00-06:00',
  status: 'PAID',
  buyerEmail: 'guest@example.com',
  total: 3000,
  function: {
    id: 4,
    title: 'Película',
    branchName: 'Central',
    theaterId: 3,
    startsAt: '2099-01-01T20:00:00-06:00',
    format: '2D',
    technology: 'STANDARD',
    isPremiere: false,
  },
  lines: [
    {
      code: 'TICKET_GENERAL_STANDARD',
      label: 'General',
      quantity: 1,
      unitPrice: 3000,
      subtotal: 3000,
    },
  ],
  tickets: [
    {
      id: 1,
      rowNumber: 1,
      columnNumber: 1,
      functionId: 4,
      theaterId: 3,
      title: 'Película',
      startsAt: '2099-01-01T20:00:00-06:00',
      functionStatus: 'ACTIVE',
      category: 'GENERAL',
      unitPrice: 3000,
    },
  ],
}
describe('Purchase receipt validation', () => {
  it('accepts current receipts, rescheduled tickets and historical invoices without tickets', () => {
    expect(readPurchaseReceipt(receipt, true)).toBe(receipt)
    expect(readPurchaseReceipt({ ...receipt, status: 'CANCELLED', tickets: [] }).tickets).toEqual(
      [],
    )
    expect(readGuestPurchaseReceipt({ ...receipt, accessCode: '12.' + '0'.repeat(26) }).id).toBe(12)
    expect(
      readGuestPurchaseReceipt({ ...receipt, accessCode: 'INV-12-' + 'a'.repeat(64) }).id,
    ).toBe(12)
  })
  it.each([
    null,
    '<html>proxy error</html>',
    {},
    { ...receipt, id: 0 },
    { ...receipt, reference: 'ORD-999999' },
    { ...receipt, purchasedAt: 'bad' },
    { ...receipt, status: 'UNKNOWN' },
    { ...receipt, buyerEmail: 'bad' },
    { ...receipt, total: NaN },
    { ...receipt, function: null },
    { ...receipt, function: { ...receipt.function, format: 'BAD' } },
    { ...receipt, lines: [null] },
    { ...receipt, lines: [{ ...receipt.lines[0], quantity: 0 }] },
    { ...receipt, tickets: [{ ...receipt.tickets[0], category: 'UNKNOWN' }] },
    { ...receipt, tickets: [{ ...receipt.tickets[0], rowNumber: 0 }] },
    { ...receipt, tickets: 'bad' },
    { ...receipt, lines: null },
  ])('rejects an incomplete response instead of marking the payment as successful: %j', (value) => {
    expect(() => readPurchaseReceipt(value, true)).toThrow(PurchaseResponseError)
  })
  it('requires generated tickets after a new payment and a valid private code for guests', () => {
    expect(() => readPurchaseReceipt({ ...receipt, tickets: [] }, true)).toThrow(
      PurchaseResponseError,
    )
    expect(() => readGuestPurchaseReceipt(receipt)).toThrow(PurchaseResponseError)
    expect(() => readGuestPurchaseReceipt({ ...receipt, accessCode: 'ORD-000012' })).toThrow(
      PurchaseResponseError,
    )
  })
})
