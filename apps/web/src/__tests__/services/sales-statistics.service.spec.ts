import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSalesStatistics } from '@/services/sales-statistics.service'
import { salesStatistics } from '../helpers/sales-statistics'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({ getApi: () => ({ get }) }))
beforeEach(() => {
  get.mockReset()
})
describe('sales statistics API service', () => {
  it('sends the period, age filter, deadline and cancellation signal', async () => {
    const data = salesStatistics()
    get.mockResolvedValue({ data })
    const signal = new AbortController().signal
    const query = { dateFrom: '2026-11-01', dateTo: '2026-11-21', minAge: 0, maxAge: 17 }
    expect(await getSalesStatistics(query, signal)).toBe(data)
    expect(get).toHaveBeenCalledWith('/sales-statistics', { params: query, signal, timeout: 15000 })
  })
  it('propagates server failures instead of returning empty statistics', async () => {
    const failure = new Error('Unavailable')
    get.mockRejectedValue(failure)
    await expect(getSalesStatistics({ dateFrom: '2026-11-01', dateTo: '2026-11-21' })).rejects.toBe(
      failure,
    )
  })
})
