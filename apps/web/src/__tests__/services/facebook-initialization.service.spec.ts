import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadFacebookSdk, applyLoginStatus, facebookLogin, getEmployeeSession, clearClientAuth } =
  vi.hoisted(() => ({
  loadFacebookSdk: vi.fn(),
  applyLoginStatus: vi.fn(),
  facebookLogin: vi.fn(),
  getEmployeeSession: vi.fn(),
  clearClientAuth: vi.fn(),
}))

vi.mock('@/loadFBSDK.js', () => ({ loadFacebookSdk }))
vi.mock('@/facebook-auth', () => ({ applyLoginStatus }))
vi.mock('@/services/authService', () => ({ facebookLogin, getEmployeeSession }))
vi.mock('@/services/client-session.service', () => ({ clearClientAuth }))

describe('Facebook startup authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getEmployeeSession.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('establishes the client session when Facebook is already connected', async () => {
    const response = {
      status: 'connected' as const,
      authResponse: { accessToken: 'facebook-access-token' },
    }
    loadFacebookSdk.mockResolvedValue(response)

    const { initializeFacebook } = await import('@/services/facebook-initialization.service')
    await initializeFacebook()

    expect(applyLoginStatus).toHaveBeenCalledExactlyOnceWith(response)
    expect(facebookLogin).toHaveBeenCalledExactlyOnceWith('facebook-access-token')
  })

  it('clears Facebook state instead of authenticating when an employee session exists', async () => {
    const response = {
      status: 'connected' as const,
      authResponse: { accessToken: 'facebook-access-token' },
    }
    loadFacebookSdk.mockResolvedValue(response)
    getEmployeeSession.mockResolvedValue({ id: 21, role: 'EMPLOYEE', firstName: 'Ana' })

    const { initializeFacebook } = await import('@/services/facebook-initialization.service')
    await initializeFacebook()

    expect(facebookLogin).not.toHaveBeenCalled()
    expect(clearClientAuth).toHaveBeenCalledExactlyOnceWith()
  })

  it.each(['unknown', 'not_authorized'] as const)(
    'does not authenticate when Facebook status is %s',
    async (status) => {
      loadFacebookSdk.mockResolvedValue({ status })

      const { initializeFacebook } = await import('@/services/facebook-initialization.service')
      await initializeFacebook()

      expect(facebookLogin).not.toHaveBeenCalled()
    },
  )
})