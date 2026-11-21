import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getApi } from '@/services/api'
import { createPromotion } from '@/services/promotion.service'
import type { CreatePromotionPayload } from '@/types/promotion'

vi.mock('@/services/api', () => ({
  getApi: vi.fn(),
}))

const post = vi.fn()

function validPayload(): CreatePromotionPayload {
  return {
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    beginHour: null,
    endHour: null,
    projectionFormat: null,
    technology: null,
    promotionTitle: 'Afternoon discount',
    description: 'Discount on eligible screenings.',
    conditions: null,
    posterPath: null,
    weekdays: [2, 4],
    branchIds: [1, 2],
  }
}

beforeEach(() => {
  post.mockReset()
  vi.mocked(getApi).mockReset()
  vi.mocked(getApi).mockReturnValue(
    { post } as unknown as ReturnType<typeof getApi>,
  )
})

describe('createPromotion', () => {
  it('posts the payload to /promotions with session credentials', async () => {
    const payload = validPayload()
    post.mockResolvedValue({ data: { promotionId: 42 } })

    await createPromotion(payload)

    expect(getApi).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/promotions',
      payload,
      { withCredentials: true },
    )
    // Pass the original payload to Axios without replacing or transforming it.
    expect(post.mock.calls[0]![1]).toBe(payload)
  })

  it('returns response.data rather than the complete Axios response', async () => {
    const data = { promotionId: 73 }
    post.mockResolvedValue({ data, status: 201, headers: {} })

    const result = await createPromotion(validPayload())

    expect(result).toBe(data)
    expect(result).toEqual({ promotionId: 73 })
  })

  it('forwards optional restrictions and the poster path unchanged', async () => {
    const payload: CreatePromotionPayload = {
      ...validPayload(),
      promotionType: 'fixed',
      promotionAmount: 1500.5,
      beginHour: '14:30',
      endHour: '24:00',
      projectionFormat: '2D',
      technology: 'IMAX',
      conditions: 'Subject to availability.',
      posterPath: '/uploads/promotions/banner.webp',
      weekdays: [],
    }
    const original = structuredClone(payload)
    post.mockResolvedValue({ data: { promotionId: 42 } })

    await createPromotion(payload)

    expect(post).toHaveBeenCalledWith('/promotions', original, { withCredentials: true })
    expect(payload).toEqual(original)
  })

  it.each([400, 401, 403, 409, 500])(
    'propagates HTTP %s errors without replacing them',
    async (status) => {
      const error = Object.assign(new Error(`HTTP ${status}`), {
        isAxiosError: true,
        response: { status, data: { message: 'Request failed.' } },
      })
      post.mockRejectedValue(error)

      await expect(createPromotion(validPayload())).rejects.toBe(error)
      expect(post).toHaveBeenCalledTimes(1)
    },
  )

  it('propagates network failures without retrying the POST', async () => {
    const error = new Error('Network Error')
    post.mockRejectedValue(error)

    await expect(createPromotion(validPayload())).rejects.toBe(error)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates missing API configuration without sending a request', async () => {
    const error = new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
    vi.mocked(getApi).mockImplementation(() => { throw error })

    await expect(createPromotion(validPayload())).rejects.toBe(error)
    expect(post).not.toHaveBeenCalled()
  })
})
