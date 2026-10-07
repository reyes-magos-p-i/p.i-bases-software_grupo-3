import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApi } from '@/services/api'
import {
  requestPasswordRecovery,
  validatePasswordRecovery,
  resetPassword,
} from '@/services/authService'

vi.mock('@/services/api', () => ({ getApi: vi.fn() }))

describe('Password recovery service', () => {
  const post = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getApi).mockReturnValue({ post } as unknown as ReturnType<typeof getApi>)
  })

  it('requests instructions for the selected account type without browser credentials', async () => {
    post.mockResolvedValue({ data: { message: 'Si existe una cuenta...' } })
    const input = { email: 'ana@example.com', accountType: 'employee' as const }
    await expect(requestPasswordRecovery(input)).resolves.toEqual({
      message: 'Si existe una cuenta...',
    })
    expect(post).toHaveBeenCalledWith('/auth/password-recovery/request', input, {
      timeout: 45000,
      adapter: 'fetch',
      withCredentials: false,
    })
  })

  it('validates the token in the body rather than a query parameter', async () => {
    post.mockResolvedValue({ data: { accountType: 'client', expiresAt: '2030-01-01' } })
    await expect(validatePasswordRecovery('token')).resolves.toHaveProperty('accountType', 'client')
    expect(post).toHaveBeenCalledWith(
      '/auth/password-recovery/validate',
      { token: 'token' },
      expect.any(Object),
    )
  })

  it('submits both passwords and the temporary authorization', async () => {
    const input = {
      token: 'token',
      temporaryPassword: 'temporary',
      newPassword: 'NewSecret123!',
      confirmNewPassword: 'NewSecret123!',
      expirationDays: 90 as const,
    }
    post.mockResolvedValue({ data: { message: 'Actualizada' } })
    await expect(resetPassword(input)).resolves.toEqual({ message: 'Actualizada' })
    expect(post).toHaveBeenCalledWith('/auth/password-recovery/reset', input, expect.any(Object))
  })

  it.each([
    'RECOVERY_INVALID',
    'TEMPORARY_PASSWORD_INCORRECT',
    'PASSWORDS_DO_NOT_MATCH',
    'PASSWORD_POLICY_VIOLATION',
  ])('maps %s without exposing server details', async (code) => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { code, message: 'private detail' } },
    })
    await expect(validatePasswordRecovery('token')).rejects.toMatchObject({
      name: 'ChangePasswordError',
      code,
    })
    await expect(validatePasswordRecovery('token')).rejects.not.toThrow('private detail')
  })

  it.each([
    [10, 10],
    [100, 60],
    ['invalid', 60],
    [undefined, 60],
    [0, 60],
  ])('honors Retry-After %s within the configured minute', async (header, expected) => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': header } },
    })
    await expect(validatePasswordRecovery('token')).rejects.toMatchObject({
      code: 'RECOVERY_THROTTLED',
      retryAfterSeconds: expected,
    })
  })

  it.each([
    new Error('network secret'),
    { isAxiosError: true },
    { isAxiosError: true, response: { status: 500, data: { code: 'PRIVATE_ERROR' } } },
  ])('sanitizes an unexpected failure: %p', async (error) => {
    post.mockRejectedValue(error)
    await expect(
      requestPasswordRecovery({ email: 'ana@example.com', accountType: 'client' }),
    ).rejects.toThrow('No se pudo completar la recuperación. Inténtalo nuevamente.')
  })
})
