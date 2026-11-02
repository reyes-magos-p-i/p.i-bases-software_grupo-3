import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPurchaseFunctions,
  getPurchaseSeats,
  quotePurchase,
  confirmPurchase,
  getMyPurchases,
  getMyPurchase,
  purchaseError,
  getTicketEmailStatus,
  resendPurchaseTickets,
} from '@/services/purchase.service'
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/services/api', () => ({ getApi: () => api }))
const receipt = {
  id: 12,
  reference: 'ORD-000012',
  qrPayload: JSON.stringify({ type: 'CINETADEL_PURCHASE', version: 1, reference: 'ORD-000012' }),
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
      branchName: 'Central',
      category: 'GENERAL',
      unitPrice: 3000,
    },
  ],
}
vi.mock('@/services/authService', () => ({
  clientRequestOptions: () => ({
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }),
}))
describe('Purchase API', () => {
  it('queries delivery status and requests a resend using the authenticated identity', async () => {
    const status = {
      status: 'PENDING',
      recipient: 'client@example.com',
      sentAt: null,
      retryAfter: 60,
    }
    api.get.mockResolvedValueOnce({ data: status })
    api.post.mockResolvedValueOnce({ data: status })
    const controller = new AbortController()
    expect(await getTicketEmailStatus(12, controller.signal)).toEqual(status)
    expect(await resendPurchaseTickets(12, controller.signal)).toEqual(status)
    expect(api.get).toHaveBeenCalledWith(
      '/purchases/me/12/email-status',
      expect.objectContaining({
        signal: controller.signal,
        headers: { Authorization: 'Bearer client-token' },
        timeout: 10000,
      }),
    )
    expect(api.post).toHaveBeenCalledWith(
      '/purchases/me/12/resend-tickets',
      {},
      expect.objectContaining({ signal: controller.signal, withCredentials: false }),
    )
  })
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
    api.post.mockResolvedValueOnce({ data: receipt })
    expect(await confirmPurchase({ ...data, requestKey: 'key', quoteVersion: 'hash' })).toEqual(
      receipt,
    )
    await getMyPurchases({ page: 1, search: '0122' })
    api.get.mockResolvedValueOnce({ data: receipt })
    expect(await getMyPurchase(12)).toEqual(receipt)
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
    expect(api.get.mock.calls[2]![1].params).toEqual({ page: 1, search: '0122' })
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
    await expect(getMyPurchases({ page: 2 })).rejects.toThrow('offline')
    expect(
      purchaseError({
        isAxiosError: true,
        response: { status: 409, data: { message: 'Asiento ocupado' } },
      }),
    ).toBe('Asiento ocupado')
    expect(purchaseError(new Error('offline'))).toContain('No se pudo completar')
  })
  it('rejects malformed confirmations and history responses with a clear error', async () => {
    const data = {
      functionId: 4,
      seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      requestKey: 'key',
      quoteVersion: 'hash',
    }
    await expect(confirmPurchase(data)).rejects.toThrow('No se pudo comprobar la respuesta')
    await expect(getMyPurchase(12)).rejects.toThrow('No se pudo comprobar la respuesta')
    const { PurchaseResponseError } = await import('@/utils/purchase-response')
    expect(purchaseError(new PurchaseResponseError())).toContain(
      'No se pudo comprobar la respuesta',
    )
  })
})
