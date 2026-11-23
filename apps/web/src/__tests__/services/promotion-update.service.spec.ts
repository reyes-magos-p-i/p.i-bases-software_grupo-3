import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApi } from '@/services/api'
import { updatePromotion } from '@/services/promotion.service'
import type { UpdatePromotionPayload } from '@/types/promotion'
vi.mock('@/services/api', () => ({ getApi: vi.fn() }))
const put = vi.fn()
const payload: UpdatePromotionPayload = {
  promotionType: 'percentage', promotionAmount: 25,
  promotionTitle: 'Editada', description: 'Descripción', conditions: null, posterPath: '/uploads/promotions/old.webp',
  beginDate: '2026-11-22', endDate: '2026-12-31', beginHour: null, endHour: null,
  projectionFormat: null, technology: null, weekdays: [], branchIds: [1,2],
}
beforeEach(() => {
  put.mockReset()
  vi.mocked(getApi).mockReset().mockReturnValue({ put } as unknown as ReturnType<typeof getApi>)
})
describe('updatePromotion', () => {
  it('sends the complete PUT payload with session credentials and returns data', async () => {
    const result = { promotionId: 42 }
    put.mockResolvedValueOnce({ data: result, status: 200 })
    await expect(updatePromotion(42, payload)).resolves.toBe(result)
    expect(put).toHaveBeenCalledExactlyOnceWith('/promotions/42', payload, { withCredentials: true })
    expect(payload.posterPath).toBe('/uploads/promotions/old.webp')
  })
  it.each([400,401,403,404,409,500])('preserves HTTP %s errors without retrying PUT', async (status) => {
    const error = { response: { status } }
    put.mockRejectedValueOnce(error)
    await expect(updatePromotion(42, payload)).rejects.toBe(error)
    expect(put).toHaveBeenCalledTimes(1)
  })
  it('preserves network errors', async () => {
    const error = new Error('Offline'); put.mockRejectedValueOnce(error)
    await expect(updatePromotion(42, payload)).rejects.toBe(error)
    expect(put).toHaveBeenCalledTimes(1)
  })
  it('does not send a request if API configuration is missing', async () => {
    const error = new Error('Missing configuration')
    vi.mocked(getApi).mockImplementationOnce(() => { throw error })
    await expect(updatePromotion(42, payload)).rejects.toBe(error)
    expect(put).not.toHaveBeenCalled()
  })
})
