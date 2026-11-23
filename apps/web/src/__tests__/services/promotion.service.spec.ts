import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApi } from '@/services/api'
import {
  createPromotion,
  deletePromotion,
  getPromotion,
  getPromotions,
  updatePromotion,
} from '@/services/promotion.service'
import type { CreatePromotionPayload } from '@/types/promotion'
import type { PromotionDetail, PromotionListItem } from '@/types/promotion-read'

// vi.mocked() only provides typing. The factory creates the actual mock.
vi.mock('@/services/api', () => ({ getApi: vi.fn() }))
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const remove = vi.fn()

function payload(): CreatePromotionPayload {
  return {
    promotionType: 'percentage', promotionAmount: 25,
    promotionTitle: 'Afternoon discount', description: 'Discount description.',
    conditions: null, posterPath: null,
    beginDate: '2026-11-22', endDate: '2026-12-31',
    beginHour: null, endHour: null,
    projectionFormat: null, technology: null,
    weekdays: [], branchIds: [1, 2],
  }
}
const listItem: PromotionListItem = {
  promotionId: 42, promotionType: 'percentage', promotionTitle: 'Afternoon discount',
  beginDate: '2026-11-22', endDate: '2026-12-31', projectionFormat: null, technology: null,
}
const detail: PromotionDetail = {
  ...listItem, promotionAmount: 25, description: 'Discount description.', conditions: null,
  posterPath: '/uploads/promotions/banner.webp', beginHour: '14:30', endHour: '24:00',
  weekdays: [2, 4], branchIds: [1, 2],
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  remove.mockReset()
  vi.mocked(getApi).mockReset().mockReturnValue(
    { get, post, put, delete: remove } as unknown as ReturnType<typeof getApi>,
  )
})

describe('createPromotion', () => {
  it('POSTs the full payload with session credentials and returns response.data', async () => {
    const body = payload()
    const result = { promotionId: 42 }
    post.mockResolvedValueOnce({ data: result, status: 201 })
    await expect(createPromotion(body)).resolves.toBe(result)
    expect(post).toHaveBeenCalledWith('/promotions', body, { withCredentials: true })
    expect(post).toHaveBeenCalledTimes(1)
    expect(getApi).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('getPromotions', () => {
  it('GETs the catalog with the supplied AbortSignal and timeout', async () => {
    const controller = new AbortController()
    const rows = [listItem]
    get.mockResolvedValueOnce({ data: rows, status: 200 })
    await expect(getPromotions(controller.signal)).resolves.toBe(rows)
    expect(get).toHaveBeenCalledWith('/promotions', {
      withCredentials: true, signal: controller.signal, timeout: 10000,
    })
    expect(get).toHaveBeenCalledTimes(1)
  })
  it('works without an AbortSignal and returns an empty catalog unchanged', async () => {
    const rows: PromotionListItem[] = []
    get.mockResolvedValueOnce({ data: rows })
    await expect(getPromotions()).resolves.toBe(rows)
    expect(get).toHaveBeenCalledWith('/promotions', {
      withCredentials: true, signal: undefined, timeout: 10000,
    })
  })
  it('does not filter out expired or future promotions', async () => {
    const rows = [
      { ...listItem, promotionId: 1, beginDate: '2000-01-01', endDate: '2000-12-31' },
      { ...listItem, promotionId: 2, beginDate: '2099-01-01', endDate: '2099-12-31' },
    ]
    get.mockResolvedValueOnce({ data: rows })
    await expect(getPromotions()).resolves.toBe(rows)
  })
})

describe('getPromotion', () => {
  it('GETs one promotion with credentials, timeout and cancellation signal', async () => {
    const controller = new AbortController()
    get.mockResolvedValueOnce({ data: detail, status: 200 })
    await expect(getPromotion(42, controller.signal)).resolves.toBe(detail)
    expect(get).toHaveBeenCalledWith('/promotions/42', {
      withCredentials: true, signal: controller.signal, timeout: 10000,
    })
    expect(get).toHaveBeenCalledTimes(1)
  })
  it('works without a cancellation signal', async () => {
    get.mockResolvedValueOnce({ data: detail })
    await getPromotion(42)
    expect(get).toHaveBeenCalledWith('/promotions/42', {
      withCredentials: true, signal: undefined, timeout: 10000,
    })
  })
})

describe('updatePromotion', () => {
  it('PUTs the complete payload to the selected ID and returns response.data', async () => {
    const body = payload()
    const result = { promotionId: 42 }
    put.mockResolvedValueOnce({ data: result, status: 200 })
    await expect(updatePromotion(42, body)).resolves.toBe(result)
    expect(put).toHaveBeenCalledWith('/promotions/42', body, { withCredentials: true })
    expect(put).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})

// Both write functions forward the complete, already validated form payload.
describe.each([
  { name: 'createPromotion', run: (body: CreatePromotionPayload) => createPromotion(body), method: post },
  { name: 'updatePromotion', run: (body: CreatePromotionPayload) => updatePromotion(42, body), method: put },
])('$name payload handling', ({ run, method }) => {
  it.each([false, true])('preserves optional restrictions and the poster path (restricted=%s)', async (restricted) => {
    const body: CreatePromotionPayload = restricted ? {
      ...payload(), promotionType: 'fixed', promotionAmount: 4000,
      beginHour: '14:30', endHour: '24:00', projectionFormat: '2D', technology: 'IMAX',
      conditions: 'Subject to availability.', posterPath: '/uploads/promotions/banner.webp', weekdays: [2, 4],
    } : payload()
    const before = structuredClone(body)
    method.mockResolvedValueOnce({ data: { promotionId: 42 } })
    await run(body)
    expect(method.mock.calls[0]![1]).toBe(body)
    expect(body).toEqual(before)
  })
})

const operations = [
  { name: 'createPromotion', run: () => createPromotion(payload()), method: post },
  { name: 'getPromotions', run: () => getPromotions(), method: get },
  { name: 'getPromotion', run: () => getPromotion(42), method: get },
  { name: 'updatePromotion', run: () => updatePromotion(42, payload()), method: put },
  { name: 'deletePromotion', run: () => deletePromotion(42), method: remove },
]
describe.each(operations)('$name errors', ({ run, method }) => {
  it.each([400, 401, 403, 404, 409, 500])('propagates HTTP %s without replacing the error or retrying', async (status) => {
    const error = { isAxiosError: true, response: { status, data: { message: 'Request failed' } } }
    method.mockRejectedValueOnce(error)
    await expect(run()).rejects.toBe(error)
    expect(method).toHaveBeenCalledTimes(1)
  })
  it('propagates network failures without retrying', async () => {
    const error = new Error('Network unavailable')
    method.mockRejectedValueOnce(error)
    await expect(run()).rejects.toBe(error)
    expect(method).toHaveBeenCalledTimes(1)
  })
  it('does not send a request if API configuration is missing', async () => {
    const error = new Error('Falta configurar VITE_API_BASE_URL.')
    vi.mocked(getApi).mockImplementationOnce(() => { throw error })
    await expect(run()).rejects.toBe(error)
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe.each([
  { name: 'getPromotions', run: (signal: AbortSignal) => getPromotions(signal) },
  { name: 'getPromotion', run: (signal: AbortSignal) => getPromotion(42, signal) },
])('$name cancellation', ({ run }) => {
  it('passes the signal and propagates cancellation unchanged', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = Object.assign(new Error('Cancelled'), { code: 'ERR_CANCELED' })
    get.mockRejectedValueOnce(error)
    await expect(run(controller.signal)).rejects.toBe(error)
    expect(get.mock.calls[0]![1].signal).toBe(controller.signal)
    expect(get).toHaveBeenCalledTimes(1)
  })
})


describe('deletePromotion', () => {
  it('sends DELETE with session credentials and resolves without data for HTTP 204', async () => {
    remove.mockResolvedValueOnce({ status: 204, data: '' })
    await expect(deletePromotion(42)).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledWith('/promotions/42', { withCredentials: true })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })
})
