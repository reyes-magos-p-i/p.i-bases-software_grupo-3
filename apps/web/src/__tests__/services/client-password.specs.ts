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

describe('client password service functions', () => {
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