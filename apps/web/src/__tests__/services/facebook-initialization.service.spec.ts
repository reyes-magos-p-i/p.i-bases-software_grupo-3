import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadFacebookSdk, applyLoginStatus, facebookLogin } = vi.hoisted(() => ({
  loadFacebookSdk: vi.fn(),
  applyLoginStatus: vi.fn(),
  facebookLogin: vi.fn(),
}))

vi.mock('@/loadFBSDK.js', () => ({ loadFacebookSdk }))
vi.mock('@/facebook-auth', () => ({ applyLoginStatus }))
vi.mock('@/services/authService', () => ({ facebookLogin }))

describe('Facebook startup authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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