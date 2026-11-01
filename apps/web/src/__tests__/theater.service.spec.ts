import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateTheaterRequest, Theater } from '@/types/theater'
import type { Seat } from '@/types/seats'

const { create, get, post, patch, del } = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

// api.ts registers a response interceptor when it is first imported.
const interceptors = { response: { use: vi.fn() } }

vi.mock('axios', () => ({ default: { create } }))

describe('theater service', () => {
  const payload: CreateTheaterRequest = {
    cinema: 'Centro',
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
    create.mockImplementation((defaults) => ({ defaults, interceptors, get, post, patch, delete: del }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('loads projectors, cinemas and statuses with the request signal and timeout', async () => {
    const projectors = [{ projectorId: 1, name: 'Laser 4K' }]
    const cinemas = [{ branchId: 4, name: 'Centro', companyId: 9 }]
    const statuses = [{ theaterStatusId: 1, name: 'Disponible' }]
    const controller = new AbortController()
    const responses: Record<string, unknown> = {
      '/projectors': projectors,
      '/cinemas': cinemas,
      '/theaters/statuses': statuses,
    }
    get.mockImplementation((path: string) => Promise.resolve({ data: responses[path] }))

    const { getTheaterCreationOptions } = await import('@/services/theater.service')

    await expect(getTheaterCreationOptions(controller.signal)).resolves.toEqual({
      projectors,
      cinemas,
      statuses,
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
    expect(get).toHaveBeenNthCalledWith(3, '/theaters/statuses', {
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
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('propagates a theater creation failure without retrying', async () => {
    const failure = new Error('creation failure')
    post.mockRejectedValue(failure)

    const { createTheater } = await import('@/services/theater.service')

    await expect(createTheater(payload)).rejects.toBe(failure)
    expect(post).toHaveBeenCalledExactlyOnceWith('/theaters', payload, { timeout: 30000 })
  })

  it('loads theater seats with the request signal and timeout', async () => {
        const apiSeats = [
      {
        theaterId: 17,
        rowNumber: 1,
        columnNumber: 2,
        state: 'libre',
        type: 'vip',
      },
    ]

    // Expected frontend data.
    const seats: Seat[] = [
      {
        theaterId: 17,
        rowNumber: 1,
        columnNumber: 2,
        state: 'free',
        type: 'vip',
      },
    ]
    const controller = new AbortController()
    get.mockResolvedValueOnce({ data: apiSeats })

    const { getTheaterSeats } = await import('@/services/theater.service')

    await expect(
      getTheaterSeats(17, controller.signal),
    ).resolves.toEqual(seats)

    expect(get).toHaveBeenCalledExactlyOnceWith('/theaters/17/seats', {
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('returns an empty array when the theater has no seats', async () => {
    get.mockResolvedValueOnce({ data: [] })

    const { getTheaterSeats } = await import('@/services/theater.service')

    await expect(getTheaterSeats(17)).resolves.toEqual([])

    expect(get).toHaveBeenCalledExactlyOnceWith('/theaters/17/seats', {
      signal: undefined,
      timeout: 10000,
    })
  })

  it('propagates a seat request failure without retrying', async () => {
    const failure = new Error('Seat request failed')
    get.mockRejectedValueOnce(failure)

    const { getTheaterSeats } = await import('@/services/theater.service')

    await expect(getTheaterSeats(17)).rejects.toBe(failure)

    expect(get).toHaveBeenCalledExactlyOnceWith('/theaters/17/seats', {
      signal: undefined,
      timeout: 10000,
    })
  })

  it.each([
  ['libre', 'normal', 'free', 'normal'],
  ['indisponible', 'vip', 'unavailable', 'vip'],
  ['ocupado', 'accesibilidad', 'in-use', 'accessibility'],
  ['reservado', 'normal', 'reserved', 'normal'],
])(
  'normalizes API seat values %s / %s',
  async (dbState, dbType, state, type) => {
    get.mockResolvedValueOnce({
      data: [
        {
          theaterId: 17,
          rowNumber: 1,
          columnNumber: 2,
          state: dbState,
          type: dbType,
        },
      ],
    })

    const { getTheaterSeats } = await import('@/services/theater.service')

    await expect(getTheaterSeats(17)).resolves.toEqual([
      {
        theaterId: 17,
        rowNumber: 1,
        columnNumber: 2,
        state,
        type,
      },
    ])
  },
)

it.each([
  ['invalid', 'vip'],
  ['libre', 'invalid'],
])('rejects unknown API seat values %s / %s', async (state, type) => {
  get.mockResolvedValueOnce({
    data: [
      {
        theaterId: 17,
        rowNumber: 1,
        columnNumber: 2,
        state,
        type,
      },
    ],
  })

  const { getTheaterSeats } = await import('@/services/theater.service')

  await expect(getTheaterSeats(17)).rejects.toThrow(
    `Unknown seat state or type: ${state}, ${type}`,
  )
})

describe('updateSeatStatuses', () => {
  const seats = [{ rowNumber: 1, columnNumber: 2 }]

  it.each([
    ['free', 'libre'],
    ['unavailable', 'indisponible'],
    ['in-use', 'ocupado'],
    ['reserved', 'reservado'],
  ] as const)('sends state %s as %s', async (state, dbState) => {
    patch.mockResolvedValueOnce({})

    const { updateSeatStatuses } = await import('@/services/theater.service')

    await expect(
      updateSeatStatuses(17, { seats, state }),
    ).resolves.toBeUndefined()

    expect(patch).toHaveBeenCalledExactlyOnceWith(
      '/theaters/17/seats',
      { seats, state: dbState },
      { timeout: 30000 },
    )
  })

  it.each([
      ['normal', 'normal'],
      ['vip', 'vip'],
      ['accessibility', 'accesibilidad'],
    ] as const)('sends type %s as %s', async (type, dbType) => {
      patch.mockResolvedValueOnce({})

      const { updateSeatStatuses } = await import('@/services/theater.service')

      await expect(
        updateSeatStatuses(17, { seats, type }),
      ).resolves.toBeUndefined()

      expect(patch).toHaveBeenCalledExactlyOnceWith(
        '/theaters/17/seats',
        { seats, type: dbType },
        { timeout: 30000 },
      )
    })

    it('sends state and type together', async () => {
      patch.mockResolvedValueOnce({})

      const { updateSeatStatuses } = await import('@/services/theater.service')

      await expect(
        updateSeatStatuses(17, {
          seats,
          state: 'unavailable',
          type: 'accessibility',
        }),
      ).resolves.toBeUndefined()

      expect(patch).toHaveBeenCalledExactlyOnceWith(
        '/theaters/17/seats',
        {
          seats,
          state: 'indisponible',
          type: 'accesibilidad',
        },
        { timeout: 30000 },
      )
    })

    it('rejects an empty selection without making a request', async () => {
      const { updateSeatStatuses } = await import('@/services/theater.service')

      await expect(
        updateSeatStatuses(17, { seats: [], state: 'free' }),
      ).rejects.toThrow('Seleccione al menos un asiento.')

      expect(patch).not.toHaveBeenCalled()
    })

    it('rejects missing changes without making a request', async () => {
      const { updateSeatStatuses } = await import('@/services/theater.service')

      await expect(
        updateSeatStatuses(17, { seats }),
      ).rejects.toThrow('Seleccione un estado o tipo.')

      expect(patch).not.toHaveBeenCalled()
    })

    it('propagates an update failure without retrying', async () => {
      const failure = new Error('Seat update failed')
      patch.mockRejectedValueOnce(failure)

      const { updateSeatStatuses } = await import('@/services/theater.service')

      await expect(
        updateSeatStatuses(17, { seats, type: 'vip' }),
      ).rejects.toBe(failure)

      expect(patch).toHaveBeenCalledTimes(1)
    })
  })
})
