import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPurchaseFunctions,
  getPurchaseSeats,
  quotePurchase,
  confirmPurchase,
  getMyPurchases,
  getMyPurchase,
  purchaseError,
} from '@/services/purchase.service'
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/services/api', () => ({ getApi: () => api }))
vi.mock('@/services/authService', () => ({
  clientRequestOptions: () => ({
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }),
}))
describe('Purchase API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({ data: { id: 12 } })
    api.post.mockResolvedValue({ data: { id: 12 } })
  })
  it('uses the client bearer token for every purchase and history request', async () => {
    const controller = new AbortController(),
      data = { functionId: 4, seats: { GENERAL: [1], CHILD: [], SENIOR: [] } }
    expect(await getPurchaseFunctions(2, controller.signal)).toEqual({ id: 12 })
    await getPurchaseSeats(4)
    await quotePurchase(data)
    await confirmPurchase({ ...data, requestKey: 'key', quoteVersion: 'hash' })
    await getMyPurchases()
    await getMyPurchase(12)
    expect(api.get.mock.calls.map(([url]) => url)).toEqual([
      '/purchases/movies/2/functions',
      '/purchases/functions/4/seats',
      '/purchases/me',
      '/purchases/me/12',
    ])
    expect(api.get.mock.calls[0]![1]).toMatchObject({
      headers: { Authorization: 'Bearer client-token' },
      signal: controller.signal,
      withCredentials: false,
    })
    expect(api.get.mock.calls[2]![1].params).toEqual({ page: 1 })
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/purchases/quote',
      data,
      expect.objectContaining({ withCredentials: false }),
    )
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/purchases',
      { ...data, requestKey: 'key', quoteVersion: 'hash' },
      expect.objectContaining({ timeout: 30000 }),
    )
  })
  it('preserves network failures and uses the shared clear error messages', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    await expect(getMyPurchases(2)).rejects.toThrow('offline')
    expect(
      purchaseError({
        isAxiosError: true,
        response: { status: 409, data: { message: 'Asiento ocupado' } },
      }),
    ).toBe('Asiento ocupado')
    expect(purchaseError(new Error('offline'))).toContain('No se pudo completar')
  })
})
