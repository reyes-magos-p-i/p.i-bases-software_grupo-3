import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getGuestPurchaseFunctions,
  getGuestPurchaseSeats,
  quoteGuestPurchase,
  identifyGuestBuyer,
  confirmGuestPurchase,
  lookupGuestPurchase,
} from '@/services/guest-purchase.service'
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/services/api', () => ({ getApi: () => api }))
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
describe('Guest purchase API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { id: 12 } })
    api.post.mockResolvedValue({ data: { id: 12 } })
  })
  it('uses public purchase endpoints without a client identity or credentials', async () => {
    const controller = new AbortController()
    const selection = { functionId: 4, seats: { GENERAL: [1], CHILD: [], SENIOR: [] } }
    const buyer = { email: 'guest@example.com', confirmEmail: 'guest@example.com' }
    expect(await getGuestPurchaseFunctions(2, controller.signal)).toEqual({ id: 12 })
    expect(await getGuestPurchaseSeats(4)).toEqual({ id: 12 })
    expect(await quoteGuestPurchase(selection, controller.signal)).toEqual({ id: 12 })
    expect(await identifyGuestBuyer(buyer, controller.signal)).toEqual({ id: 12 })
    const guestReceipt = { ...receipt, accessCode: '12.' + '0'.repeat(26) }
    api.post.mockResolvedValue({ data: guestReceipt })
    const data = { ...selection, ...buyer, requestKey: 'key', quoteVersion: 'version' }
    expect(await confirmGuestPurchase(data)).toEqual(guestReceipt)
    expect(await lookupGuestPurchase('private', controller.signal)).toEqual(guestReceipt)
    expect(api.get.mock.calls).toEqual([
      ['/guest-purchases/movies/2/functions', { signal: controller.signal, timeout: 10000 }],
      ['/guest-purchases/functions/4/seats', { signal: undefined, timeout: 10000 }],
    ])
    expect(api.post.mock.calls).toEqual([
      ['/guest-purchases/quote', selection, { signal: controller.signal, timeout: 10000 }],
      ['/guest-purchases/buyer', buyer, { signal: controller.signal, timeout: 10000 }],
      [
        '/guest-purchases',
        { ...selection, requestKey: 'key', quoteVersion: 'version', buyer },
        { timeout: 30000 },
      ],
      [
        '/guest-purchases/lookup',
        { accessCode: 'private' },
        { signal: controller.signal, timeout: 10000 },
      ],
    ])
    expect(
      api.post.mock.calls
        .flat()
        .some((value) => typeof value === 'string' && value.includes('private')),
    ).toBe(false)
  })
  it('preserves a failed payment response for uncertain-result handling', async () => {
    const failure = new Error('timeout')
    api.post.mockRejectedValue(failure)
    await expect(
      confirmGuestPurchase({
        functionId: 4,
        seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
        requestKey: 'key',
        quoteVersion: 'version',
        email: 'guest@example.com',
        confirmEmail: 'guest@example.com',
      }),
    ).rejects.toBe(failure)
  })
  it('rejects incomplete successful replies instead of losing the consultation code', async () => {
    await expect(
      confirmGuestPurchase({
        functionId: 4,
        seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
        requestKey: 'key',
        quoteVersion: 'version',
        email: 'guest@example.com',
        confirmEmail: 'guest@example.com',
      }),
    ).rejects.toThrow('No se pudo comprobar la respuesta')
    await expect(lookupGuestPurchase('private')).rejects.toThrow(
      'No se pudo comprobar la respuesta',
    )
    expect(api.post).toHaveBeenLastCalledWith(
      '/guest-purchases/lookup',
      { accessCode: 'private' },
      { signal: undefined, timeout: 10000 },
    )
  })
})
