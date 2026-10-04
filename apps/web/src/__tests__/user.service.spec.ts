import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateClientRequest,
  CreateEmployeeRequest,
  CreatedUser,
  UserApiError,
} from '@/types/user'

const { create, post, get } = vi.hoisted(() => ({
  create: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
}))

vi.mock('axios', () => ({ default: { create } }))

describe('createUser', () => {
  const client: CreateClientRequest = {
    role: 'CLIENT',
    email: 'cliente@example.com',
    firstName: 'Ana',
  }
  const employee: CreateEmployeeRequest = {
    role: 'EMPLOYEE',
    email: 'empleado@example.com',
    firstName: 'José',
    secondName: null,
    firstSurname: 'Núñez',
    secondSurname: 'Solano',
    hireDate: '2026-10-01',
    birthday: '2000-02-29',
    phoneNumber: '+506 8888-8888',
    address: { districtId: 7, details: 'Casa azul' },
    branchId: 3,
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    create.mockImplementation((config: { baseURL?: string }) => ({
      defaults: config,
      post,
      get,
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([client, employee, { ...employee, role: 'ADMINISTRATOR' as const }])(
    'posts a $role to /users and returns only the response data',
    async (payload) => {
      const { createUser } = await import('@/services/user.service')
      const result: CreatedUser = { id: 42, role: payload.role, email: payload.email }
      post.mockResolvedValue({ status: 201, data: result, headers: {} })

      await expect(createUser(payload)).resolves.toEqual(result)

      expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: 'https://api.example.com' })
      expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload, { timeout: 60000 })
    },
  )

  it('posts a client with a new address and preserves optional details', async () => {
    const { createUser } = await import('@/services/user.service')
    const payload: CreateClientRequest = { ...client, address: { districtId: 7, details: null } }
    post.mockResolvedValue({ data: { id: 42, role: 'CLIENT', email: client.email } })
    await createUser(payload)
    expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload, { timeout: 60000 })
  })

  it('preserves optional client fields and nulls in the request', async () => {
    const { createUser } = await import('@/services/user.service')
    const payload: CreateClientRequest = {
      ...client,
      secondName: null,
      firstSurname: 'Núñez',
      secondSurname: null,
      birthday: '2000-02-29',
      phoneNumber: '+506 8888-8888',
      address: null,
      language: 'es-CR',
    }
    post.mockResolvedValue({ data: { id: 42, role: 'CLIENT', email: client.email } })

    await createUser(payload)

    expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload, { timeout: 60000 })
  })

  it('trims surrounding whitespace from the configured backend URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '  https://api.example.com  ')
    const { createUser } = await import('@/services/user.service')
    post.mockResolvedValue({ data: { id: 42, role: 'CLIENT', email: client.email } })

    await createUser(client)

    expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: 'https://api.example.com' })
  })

  it.each([undefined, '', '   '])(
    'does not send a request if the backend URL is %p',
    async (baseURL) => {
      vi.stubEnv('VITE_API_BASE_URL', baseURL)
      const { createUser } = await import('@/services/user.service')

      await expect(createUser(client)).rejects.toThrow(
        'Falta configurar VITE_API_BASE_URL para conectar con el backend.',
      )
      expect(post).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      statusCode: 400,
      message: ['El primer nombre es obligatorio.'],
      error: 'Solicitud inválida',
    },
    {
      statusCode: 409,
      message: 'Ya existe un cliente con ese correo electrónico.',
      error: 'Conflict',
    },
    {
      statusCode: 500,
      message: 'Internal server error',
    },
    {
      statusCode: 502,
      message: 'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
      error: 'Bad Gateway',
    },
  ] satisfies UserApiError[])(
    'preserves the $statusCode error and never retries creation',
    async (data) => {
      const { createUser } = await import('@/services/user.service')
      const failure = Object.assign(new Error('HTTP request failed'), {
        isAxiosError: true,
        response: { status: data.statusCode, data },
      })
      post.mockRejectedValue(failure)

      await expect(createUser(client)).rejects.toBe(failure)
      expect(post).toHaveBeenCalledExactlyOnceWith('/users', client, { timeout: 60000 })
    },
  )

  it('preserves a creation timeout without retrying', async () => {
    const { createUser } = await import('@/services/user.service')
    const error = Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' })
    post.mockRejectedValue(error)
    await expect(createUser(client)).rejects.toBe(error)
    expect(post).toHaveBeenCalledExactlyOnceWith('/users', client, { timeout: 60000 })
  })

  describe('getUserCreationOptions', () => {
    it('serializes selected roles and branches as comma-separated query values', async () => {
      const { getUsers } = await import('@/services/user.service')
      get.mockResolvedValue({ data: { items: [], total: 0 } })
      await getUsers('employees', {
        page: 1,
        pageSize: 10,
        sortBy: 'id',
        sortDirection: 'asc',
        role: ['EMPLOYEE', 'ADMINISTRATOR'],
        branchId: [3, 5],
      })
      expect(get).toHaveBeenCalledWith(
        '/users/employees',
        expect.objectContaining({
          params: {
            page: 1,
            pageSize: 10,
            sortBy: 'id',
            sortDirection: 'asc',
            role: 'EMPLOYEE,ADMINISTRATOR',
            branchId: '3,5',
          },
        }),
      )
    })
    it('omits empty filter arrays instead of sending invalid empty values', async () => {
      const { getUsers } = await import('@/services/user.service')
      get.mockResolvedValue({ data: { items: [], total: 0 } })
      await getUsers('employees', {
        page: 1,
        pageSize: 10,
        sortBy: 'id',
        sortDirection: 'asc',
        role: [],
        branchId: [],
      })
      expect(get.mock.calls[0]?.[1].params).toMatchObject({ role: undefined, branchId: undefined })
    })
    it.each(['clients', 'employees'] as const)(
      'requests the %s page with filters, timeout and cancellation',
      async (section) => {
        const { getUsers } = await import('@/services/user.service')
        const query = {
          page: 2,
          pageSize: 25,
          search: 'Ana Núñez',
          sortBy: 'name',
          sortDirection: 'asc' as const,
        }
        const signal = new AbortController().signal
        const data = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }
        get.mockResolvedValue({ data })
        expect(await getUsers(section, query, signal)).toEqual(data)
        expect(get).toHaveBeenCalledExactlyOnceWith('/users/' + section, {
          params: query,
          signal,
          timeout: 10000,
        })
      },
    )
    it('loads only the branch options needed by employee filtering', async () => {
      const { getEmployeeListOptions } = await import('@/services/user.service')
      const data = { branches: [{ id: 3, label: 'Centro' }] }
      const signal = new AbortController().signal
      get.mockResolvedValue({ data })
      expect(await getEmployeeListOptions(signal)).toEqual(data)
      expect(get).toHaveBeenCalledExactlyOnceWith('/users/employees/options', {
        signal,
        timeout: 10000,
      })
    })
    it('loads catalog data through the same Axios instance with a timeout and signal', async () => {
      vi.stubEnv('VITE_API_BASE_URL', '/api')
      const { getUserCreationOptions } = await import('@/services/user.service')
      const data = {
        provinces: [{ id: 1, label: 'San José' }],
        cantons: [],
        districts: [],
        branches: [],
      }
      const controller = new AbortController()
      get.mockResolvedValue({ data })
      await expect(getUserCreationOptions(controller.signal)).resolves.toEqual(data)
      expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: '/api' })
      expect(get).toHaveBeenCalledExactlyOnceWith('/users/creation-options', {
        signal: controller.signal,
        timeout: 10000,
      })
      expect(post).not.toHaveBeenCalled()
    })

    it.each([undefined, '', '   '])(
      'rejects missing configuration %p before requesting catalogs',
      async (baseURL) => {
        vi.stubEnv('VITE_API_BASE_URL', baseURL)
        const { getUserCreationOptions } = await import('@/services/user.service')
        await expect(getUserCreationOptions()).rejects.toThrow('Falta configurar VITE_API_BASE_URL')
        expect(get).not.toHaveBeenCalled()
      },
    )

    it.each(['ERR_NETWORK', 'ECONNABORTED', 'ERR_CANCELED', 'HTTP_403', 'HTTP_500'])(
      'propagates %s without automatic retries',
      async (code) => {
        const { getUserCreationOptions } = await import('@/services/user.service')
        const failure = Object.assign(new Error('Request failed'), { code })
        get.mockRejectedValue(failure)
        await expect(getUserCreationOptions()).rejects.toBe(failure)
        expect(get).toHaveBeenCalledExactlyOnceWith('/users/creation-options', {
          signal: undefined,
          timeout: 10000,
        })
      },
    )
  })

  it('propagates a network error without retrying or reporting success', async () => {
    const { createUser } = await import('@/services/user.service')
    const failure = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      code: 'ERR_NETWORK',
    })
    post.mockRejectedValue(failure)

    await expect(createUser(client)).rejects.toBe(failure)
    expect(post).toHaveBeenCalledExactlyOnceWith('/users', client, { timeout: 60000 })
  })
})
