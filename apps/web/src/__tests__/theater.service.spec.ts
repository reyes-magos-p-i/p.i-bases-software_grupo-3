import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateTheaterRequest, Theater } from '@/types/theater'

const { create, get, post, patch, del } = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('axios', () => ({ default: { create } }))

describe('theater service', () => {
  const payload: CreateTheaterRequest = {
    branchId: 4,
    numberOfSeats: 120,
    dimensionX: 12,
    dimensionY: 10,
    projectorName: 'Laser 4K',
    status: 'Disponible',
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, get, post, patch, delete: del }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('loads projectors and cinemas with the request signal and timeout', async () => {
    const projectors = [{ projectorId: 1, name: 'Laser 4K' }]
    const cinemas = [{ branchId: 4, name: 'Centro', companyId: 9 }]
    const controller = new AbortController()
    get.mockImplementation((path: string) =>
      Promise.resolve({ data: path === '/projectors' ? projectors : cinemas }),
    )

    const { getTheaterCreationOptions } = await import('@/services/theater.service')

    await expect(getTheaterCreationOptions(controller.signal)).resolves.toEqual({
      projectors,
      cinemas,
    })
    expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: '/api' })
    expect(get).toHaveBeenNthCalledWith(1, '/projectors', {
      signal: controller.signal,
      timeout: 10000,
    })
    expect(get).toHaveBeenNthCalledWith(2, '/cinemas', {
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('creates a theater and returns the response data', async () => {
    const theater: Theater = {
      theaterId: 17,
      ...payload,
      isActive: true,
      status: 'Disponible',
    }
    post.mockResolvedValue({ data: theater })

    const { createTheater } = await import('@/services/theater.service')

    await expect(createTheater(payload)).resolves.toEqual(theater)
    expect(post).toHaveBeenCalledExactlyOnceWith('/theaters', payload, { timeout: 30000 })
  })

  it('loads all theaters with the request signal and timeout', async () => {
    const theaters: Theater[] = []
    const controller = new AbortController()
    get.mockResolvedValue({ data: theaters })

    const { getTheaters } = await import('@/services/theater.service')

    await expect(getTheaters(controller.signal)).resolves.toBe(theaters)
    expect(get).toHaveBeenCalledExactlyOnceWith('/theaters', {
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('updates and deactivates a theater', async () => {
    const theater = { theaterId: 17, ...payload, isActive: true, status: 'Disponible' as const }
    patch.mockResolvedValue({ data: theater })
    del.mockResolvedValue({})

    const { updateTheater, deleteTheater } = await import('@/services/theater.service')

    await expect(updateTheater(17, payload)).resolves.toEqual(theater)
    await expect(deleteTheater(17)).resolves.toBeUndefined()
    expect(patch).toHaveBeenCalledExactlyOnceWith('/theaters/17', payload, { timeout: 30000 })
    expect(del).toHaveBeenCalledExactlyOnceWith('/theaters/17', { timeout: 30000 })
  })

  it('propagates a catalog request failure without retrying', async () => {
    const failure = new Error('network failure')
    get.mockRejectedValue(failure)

    const { getTheaterCreationOptions } = await import('@/services/theater.service')

    await expect(getTheaterCreationOptions()).rejects.toBe(failure)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('propagates a theater creation failure without retrying', async () => {
    const failure = new Error('creation failure')
    post.mockRejectedValue(failure)

    const { createTheater } = await import('@/services/theater.service')

    await expect(createTheater(payload)).rejects.toBe(failure)
    expect(post).toHaveBeenCalledExactlyOnceWith('/theaters', payload, { timeout: 30000 })
  })
})