import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateProjectionRequest, UpdateProjectionRequest } from '@/types/projection'

const { create, get, post, put, patch } = vi.hoisted(() => ({
  patch: vi.fn(),
  put: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('axios', () => ({ default: { create } }))

describe('projection service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, get, post, put, patch }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('loads the scheduling options', async () => {
    const options = { cinemas: [], theaters: [] }
    const controller = new AbortController()
    get.mockResolvedValue({ data: options })
    const { getProjectionSchedulingOptions } = await import('@/services/projection.service')

    await expect(getProjectionSchedulingOptions(controller.signal)).resolves.toBe(options)
    expect(get).toHaveBeenCalledWith('/projections/options', {
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('searches the available movies of a branch', async () => {
    const movies = [{ movieId: 3, title: 'Spider-Man', runningTime: 190, posterImage: 'a.jpg' }]
    get.mockResolvedValue({ data: movies })
    const { searchAvailableMovies } = await import('@/services/projection.service')

    await expect(searchAvailableMovies(2, 'spi')).resolves.toBe(movies)
    expect(get).toHaveBeenCalledWith('/projections/available-movies', {
      params: { branchId: 2, search: 'spi' },
      signal: undefined,
      timeout: 10000,
    })
  })

  it('loads the list, its filter options and one detail', async () => {
    const controller = new AbortController()
    get.mockResolvedValue({ data: 'data' })
    const { getProjectionFilterOptions, getProjections, getProjectionDetail } = await import(
      '@/services/projection.service'
    )
    const query = { page: 2, pageSize: 25, status: 'ACTIVE' as const }

    await expect(getProjectionFilterOptions(controller.signal)).resolves.toBe('data')
    await expect(getProjections(query, controller.signal)).resolves.toBe('data')
    await expect(getProjectionDetail(100, controller.signal)).resolves.toBe('data')
    expect(get.mock.calls).toEqual([
      ['/projections/filter-options', { signal: controller.signal, timeout: 10000 }],
      ['/projections', { params: query, signal: controller.signal, timeout: 10000 }],
      ['/projections/100', { signal: controller.signal, timeout: 10000 }],
    ])
  })

  it('creates projections', async () => {
    const payload = { movieId: 3 } as CreateProjectionRequest
    const created = { status: 'ACTIVE', price: 4500, projections: [] }
    post.mockResolvedValue({ data: created })
    const { createProjections } = await import('@/services/projection.service')

    await expect(createProjections(payload)).resolves.toBe(created)
    expect(post).toHaveBeenCalledWith('/projections', payload, { timeout: 30000 })
  })

  it('updates one projection', async () => {
    const payload = { movieId: 3, price: 4200 } as UpdateProjectionRequest
    put.mockResolvedValue({ data: 'detail' })
    const { updateProjection } = await import('@/services/projection.service')

    await expect(updateProjection(100, payload)).resolves.toBe('detail')
    expect(put).toHaveBeenCalledWith('/projections/100', payload, { timeout: 30000 })
  })

  it('cancels one projection', async () => {
    patch.mockResolvedValue({ data: 'cancelled' })
    const { cancelProjection } = await import('@/services/projection.service')

    await expect(cancelProjection(21)).resolves.toBe('cancelled')
    expect(patch).toHaveBeenCalledWith('/projections/21/cancel', undefined, { timeout: 30000 })
  })
})
