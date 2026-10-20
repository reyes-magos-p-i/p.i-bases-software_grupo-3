import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  loadFacebookSdk,
  applyLoginStatus,
  facebookLogin,
  getEmployeeSession,
  clearClientAuth,
  clientSessionRevision,
} = vi.hoisted(() => ({
  loadFacebookSdk: vi.fn(),
  applyLoginStatus: vi.fn(),
  facebookLogin: vi.fn(),
  getEmployeeSession: vi.fn(),
  clearClientAuth: vi.fn(),
  clientSessionRevision: vi.fn(),
}))

vi.mock('@/loadFBSDK.js', () => ({ loadFacebookSdk }))
vi.mock('@/facebook-auth', () => ({ applyLoginStatus }))
vi.mock('@/services/authService', () => ({ facebookLogin, getEmployeeSession }))
vi.mock('@/services/client-session.service', () => ({
  clearClientAuth,
  clientSessionRevision,
  CLIENT_ACCESS_TOKEN_KEY: 'accessToken',
}))

describe('Facebook startup authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    clientSessionRevision.mockReturnValue(0)
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
    expect(facebookLogin).toHaveBeenCalledExactlyOnceWith('facebook-access-token', 0)
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

  it('preserves a local session if the Facebook SDK fails', async () => {
    localStorage.setItem('accessToken', 'local-token')
    loadFacebookSdk.mockRejectedValueOnce(new Error('SDK unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { initializeFacebook } = await import('@/services/facebook-initialization.service')
    await initializeFacebook()
    expect(clearClientAuth).not.toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBe('local-token')
  })

  it('does not replace a local session with Facebook at startup', async () => {
    localStorage.setItem('accessToken', 'local-token')
    loadFacebookSdk.mockResolvedValue({
      status: 'connected',
      authResponse: { accessToken: 'facebook-token' },
    })
    const { initializeFacebook } = await import('@/services/facebook-initialization.service')
    await initializeFacebook()
    expect(facebookLogin).not.toHaveBeenCalled()
    expect(getEmployeeSession).not.toHaveBeenCalled()
  })

  it('discards SDK initialization after a session change', async () => {
    clientSessionRevision.mockReturnValueOnce(0).mockReturnValue(1)
    loadFacebookSdk.mockResolvedValue({
      status: 'connected',
      authResponse: { accessToken: 'facebook-token' },
    })
    const { initializeFacebook } = await import('@/services/facebook-initialization.service')
    await initializeFacebook()
    expect(facebookLogin).not.toHaveBeenCalled()
    expect(clearClientAuth).not.toHaveBeenCalled()
  })
})
