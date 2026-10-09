import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  changeClientPassword,
  getClientPasswordStatus,
  ChangePasswordError,
} from '@/services/authService'
import { getApi } from '@/services/api'

vi.mock('@/services/api', () => ({ getApi: vi.fn() }))
vi.mock('@/services/client-session.service', () => ({
  CLIENT_ACCESS_TOKEN_KEY: 'accessToken',
}))

describe('client password service', () => {
  const get = vi.fn()
  const patch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('accessToken', 'token-123')
    vi.mocked(getApi).mockReturnValue({ get, patch } as unknown as ReturnType<typeof getApi>)
  })

  it('attaches the stored client token and returns the status', async () => {
    get.mockResolvedValueOnce({ data: { status: 'expired' } })
    const status = await getClientPasswordStatus()
    expect(status).toBe('expired')
    expect(get).toHaveBeenCalledWith(
      '/auth/password-status',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    )
  })

  it('allows the password status request without an Authorization header when no client token exists', async () => {
    localStorage.removeItem('accessToken')
    get.mockResolvedValueOnce({ data: { status: 'must_set' } })

    await expect(getClientPasswordStatus()).resolves.toBe('must_set')
    expect(get).toHaveBeenCalledWith('/auth/password-status', { headers: {} })
  })

  it('maps password status request failures to a safe typed error', async () => {
    get.mockRejectedValueOnce(new Error('private network detail'))

    await expect(getClientPasswordStatus()).rejects.toMatchObject({
      name: 'ChangePasswordError',
      message: 'No se pudo comprobar el estado de la contraseña.',
    })
  })

  it.each([
    ['CURRENT_PASSWORD_INCORRECT', 'La contraseña actual no es correcta.'],
    ['PASSWORDS_DO_NOT_MATCH', 'Las contraseñas no coinciden.'],
    ['NEW_PASSWORD_SAME_AS_CURRENT', 'La nueva contraseña no puede ser igual a la actual.'],
    ['PASSWORD_POLICY_VIOLATION', 'La contraseña no cumple con la política de seguridad.'],
  ])('maps %s to its typed user-facing error', async (code, message) => {
    patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { code, violations: ['min_length'] } },
    })

    await expect(
      changeClientPassword({
        currentPassword: 'old',
        newPassword: 'new',
        confirmNewPassword: 'new',
        expirationDays: 90,
      }),
    ).rejects.toMatchObject({
      name: 'ChangePasswordError',
      code,
      message,
      ...(code === 'PASSWORD_POLICY_VIOLATION' ? { violations: ['min_length'] } : {}),
    })
  })

  it('maps unrecognized server errors to the generic password update message', async () => {
    patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { code: 'UNEXPECTED_FAILURE' } },
    })

    await expect(
      changeClientPassword({
        newPassword: 'new',
        confirmNewPassword: 'new',
        expirationDays: 90,
      }),
    ).rejects.toThrow('No se pudo actualizar la contraseña, intenta de nuevo.')
  })

  it('maps PASSWORD_POLICY_VIOLATION to a ChangePasswordError with violations', async () => {
    patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { code: 'PASSWORD_POLICY_VIOLATION', violations: ['min_length'] } },
    })
    await expect(
      changeClientPassword({
        currentPassword: 'old',
        newPassword: 'new',
        confirmNewPassword: 'new',
        expirationDays: 90,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ChangePasswordError)
      expect((error as ChangePasswordError).violations).toEqual(['min_length'])
      return true
    })
  })

  it('maps a connection failure to the generic retry message', async () => {
    patch.mockRejectedValueOnce(new Error('network down'))
    await expect(
      changeClientPassword({
        newPassword: 'new',
        confirmNewPassword: 'new',
        expirationDays: 90,
      }),
    ).rejects.toThrowError('No se pudo actualizar la contraseña, intenta de nuevo.')
  })
})