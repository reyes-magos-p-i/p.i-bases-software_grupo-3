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
    expect(await quoteGuestPurchase(selection)).toEqual({ id: 12 })
    expect(await identifyGuestBuyer(buyer)).toEqual({ id: 12 })
    const data = { ...selection, ...buyer, requestKey: 'key', quoteVersion: 'version' }
    expect(await confirmGuestPurchase(data)).toEqual({ id: 12 })
    expect(await lookupGuestPurchase('private', controller.signal)).toEqual({ id: 12 })
    expect(api.get.mock.calls).toEqual([
      ['/guest-purchases/movies/2/functions', { signal: controller.signal }],
      ['/guest-purchases/functions/4/seats', { signal: undefined }],
    ])
    expect(api.post.mock.calls).toEqual([
      ['/guest-purchases/quote', selection],
      ['/guest-purchases/buyer', buyer],
      [
        '/guest-purchases',
        { ...selection, requestKey: 'key', quoteVersion: 'version', buyer },
        { timeout: 30000 },
      ],
      ['/guest-purchases/lookup', { accessCode: 'private' }, { signal: controller.signal }],
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
})
