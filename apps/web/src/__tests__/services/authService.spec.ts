import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterPayload } from '@/types/client'

const { create, post, get } = vi.hoisted(() => ({ create: vi.fn(), post: vi.fn(), get: vi.fn() }))
vi.mock('axios', () => ({
  default: { create },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}))

describe('registerUser', () => {
  const payload: RegisterPayload = {
    email: 'test@example.com',
    firstName: 'Juan',
    lastName: 'Perez',
    phone: '1234567890',
    gender: 'M',
    birthDate: '1990-01-01',
    language: 'es',
    password: 'Password123!',
    acceptTerms: true,
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, post, get }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('shares the Axios instance and URL with user creation', async () => {
    const { registerUser } = await import('@/services/authService')
    const { getUserCreationOptions } = await import('@/services/user.service')
    post.mockResolvedValue({ status: 201 })
    get.mockResolvedValue({ data: {} })
    await expect(registerUser(payload)).resolves.toBeUndefined()
    await getUserCreationOptions()
    expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: '/api' })
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/register', payload, { timeout: 60000 })
  })

  it.each([
    ['Correo en uso', 'Correo en uso'],
    [['Correo incorrecto', 'Clave corta'], 'Correo incorrecto. Clave corta'],
    [undefined, 'No se pudo crear la cuenta'],
    ['', 'No se pudo crear la cuenta'],
    [[], 'No se pudo crear la cuenta'],
    [[42], 'No se pudo crear la cuenta'],
    [{ unexpected: true }, 'No se pudo crear la cuenta'],
  ])('handles response message %j without retrying', async (message, expected) => {
    const { registerUser } = await import('@/services/authService')
    post.mockRejectedValue({ isAxiosError: true, response: { data: { message } } })
    await expect(registerUser(payload)).rejects.toThrow(expected)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([
    { isAxiosError: true, code: 'ERR_NETWORK' },
    { isAxiosError: true, code: 'ECONNABORTED' },
    { isAxiosError: true, response: { data: '<html>Error</html>' } },
    new Error('Unexpected failure'),
  ])('reports transport failures without retrying or returning success', async (error) => {
    const { registerUser } = await import('@/services/authService')
    post.mockRejectedValue(error)
    await expect(registerUser(payload)).rejects.toThrow('No se pudo crear la cuenta')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', '   '])('requires the shared API URL (%j)', async (baseURL) => {
    vi.stubEnv('VITE_API_BASE_URL', baseURL)
    const { registerUser } = await import('@/services/authService')
    await expect(registerUser(payload)).rejects.toThrow('VITE_API_BASE_URL')
    expect(post).not.toHaveBeenCalled()
  })
})
