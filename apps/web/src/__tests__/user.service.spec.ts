import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateClientRequest,
  CreateEmployeeRequest,
  CreatedUser,
  UserApiError,
} from '@/types/user'

const { create, post } = vi.hoisted(() => ({
  create: vi.fn(),
  post: vi.fn(),
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
      expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload)
    },
  )

  it('posts a client with a new address and preserves optional details', async () => {
    const { createUser } = await import('@/services/user.service')
    const payload: CreateClientRequest = { ...client, address: { districtId: 7, details: null } }
    post.mockResolvedValue({ data: { id: 42, role: 'CLIENT', email: client.email } })
    await createUser(payload)
    expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload)
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

    expect(post).toHaveBeenCalledExactlyOnceWith('/users', payload)
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
      expect(post).toHaveBeenCalledExactlyOnceWith('/users', client)
    },
  )

  it('propagates a network error without retrying or reporting success', async () => {
    const { createUser } = await import('@/services/user.service')
    const failure = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      code: 'ERR_NETWORK',
    })
    post.mockRejectedValue(failure)

    await expect(createUser(client)).rejects.toBe(failure)
    expect(post).toHaveBeenCalledExactlyOnceWith('/users', client)
  })
})
