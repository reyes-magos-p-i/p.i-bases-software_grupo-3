import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getClientProfile,
  getClientAddressOptions,
  updateClientProfile,
  deactivateClientProfile,
  requestClientEmailChange,
  confirmClientEmailChange,
  clientProfileError,
} from '@/services/client-profile.service'

const { get, patch, post } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }))
vi.mock('@/services/api', () => ({ getApi: () => ({ get, patch, post }) }))
vi.mock('@/services/authService', () => ({
  clientRequestOptions: () => ({
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }),
}))

describe('Client profile API', () => {
  const options = {
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }
  beforeEach(() => {
    vi.resetAllMocks()
    get.mockResolvedValue({ data: { id: 7 } })
    post.mockResolvedValue({ data: { clientId: 7 } })
  })
  it('uses the current client bearer token for reads without employee cookies', async () => {
    const signal = new AbortController().signal
    await expect(getClientProfile(signal)).resolves.toEqual({ id: 7 })
    expect(get).toHaveBeenCalledWith('/clients/me', { ...options, signal })
    await expect(getClientAddressOptions()).resolves.toEqual({ id: 7 })
    expect(get).toHaveBeenCalledWith('/clients/me/address-options', {
      ...options,
      signal: undefined,
    })
  })
  it('sends profile and lifecycle mutations through protected endpoints', async () => {
    await updateClientProfile({ firstName: 'Ana' })
    expect(patch).toHaveBeenCalledWith('/clients/me', { firstName: 'Ana' }, options)
    await deactivateClientProfile()
    expect(patch).toHaveBeenCalledWith('/clients/me/deactivate', {}, options)
  })
  it('allows SMTP time and confirms links without requiring an existing session', async () => {
    await requestClientEmailChange('new@example.com')
    expect(post).toHaveBeenCalledWith(
      '/clients/me/email-change',
      { email: 'new@example.com' },
      { ...options, timeout: 60000 },
    )
    await expect(confirmClientEmailChange('token')).resolves.toEqual({ clientId: 7 })
    expect(post).toHaveBeenCalledWith(
      '/clients/email-change/confirm',
      { token: 'token' },
      { adapter: 'fetch', withCredentials: false, timeout: 10000 },
    )
  })
  it.each([
    [401, undefined, 'Tu sesión terminó'],
    [429, undefined, 'Espera un minuto'],
    [400, 'Selecciona un distrito.', 'Selecciona un distrito.'],
    [409, ['Correo reservado.', 'Usa otro.'], 'Correo reservado. Usa otro.'],
    [400, 42, 'fallback'],
    [400, ['ok', 42], 'fallback'],
    [404, undefined, 'Error 404'],
    [500, 'private', 'Error 500'],
  ])('formats HTTP %s with actionable feedback', (status, message, expected) => {
    expect(
      clientProfileError(
        { isAxiosError: true, response: { status, data: { message } } },
        'fallback',
      ),
    ).toContain(expected)
  })
  it('preserves generic and connection fallback handling', () => {
    expect(clientProfileError(new Error('private'), 'fallback')).toBe('fallback')
    expect(clientProfileError({ isAxiosError: true }, 'fallback')).toContain('conectar')
  })
})
