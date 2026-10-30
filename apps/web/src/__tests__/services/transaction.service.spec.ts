import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { create, get } = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }))

vi.mock('axios', () => ({ default: { create } }))

describe('transaction service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, get }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('requests one page of transactions with the search and filters', async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 20, totalPages: 0 }
    get.mockResolvedValue({ data: page })
    const controller = new AbortController()
    const { getTransactions } = await import('@/services/transaction.service')
    const query = {
      page: 2,
      pageSize: 20 as const,
      search: 'FAC-000123',
      branchId: 1,
      status: 'PAID' as const,
      dateFrom: '2026-10-05',
    }

    await expect(getTransactions(query, controller.signal)).resolves.toBe(page)
    expect(get).toHaveBeenCalledWith('/transactions', {
      params: query,
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('requests the filter options', async () => {
    const options = { branches: [], movies: [] }
    get.mockResolvedValue({ data: options })
    const { getTransactionFilterOptions } = await import('@/services/transaction.service')

    await expect(getTransactionFilterOptions()).resolves.toBe(options)
    expect(get).toHaveBeenCalledWith('/transactions/filter-options', {
      signal: undefined,
      timeout: 10000,
    })
  })
})
