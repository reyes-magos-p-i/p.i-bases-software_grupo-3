import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyLoginStatus,
  fbAuth,
  loginWithFacebook,
  logoutFromFacebook,
} from '@/facebook-auth'

describe('Facebook auth adapter', () => {
  const connectedResponse: fb.StatusResponse = {
    status: 'connected',
    authResponse: {
      accessToken: 'facebook-access-token',
      expiresIn: 3600,
      signedRequest: 'signed-request',
      userID: 'facebook-user-id',
    },
  }
  const unknownResponse: fb.StatusResponse = { status: 'unknown' }
  const login = vi.fn()
  const logout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fbAuth.status = 'unknown'
    fbAuth.authResponse = null
    fbAuth.user = null
    vi.stubGlobal('FB', { login, logout })
  })

  it('applies a Facebook status and clears a missing auth response', () => {
    applyLoginStatus(connectedResponse)
    expect(fbAuth.status).toBe('connected')
    expect(fbAuth.authResponse).toEqual(connectedResponse.authResponse)

    applyLoginStatus(unknownResponse)
    expect(fbAuth.status).toBe('unknown')
    expect(fbAuth.authResponse).toBeNull()
  })

  it('requests public profile and email, then applies and returns the login status', async () => {
    login.mockImplementation(
      (callback: (response: fb.StatusResponse) => void, options: { scope: string }) => {
        callback(connectedResponse)
        expect(options).toEqual({ scope: 'public_profile,email' })
      },
    )

    await expect(loginWithFacebook()).resolves.toEqual(connectedResponse)

    expect(login).toHaveBeenCalledOnce()
    expect(fbAuth.status).toBe('connected')
    expect(fbAuth.authResponse).toEqual(connectedResponse.authResponse)
  })

  it('applies logout status and clears the locally held Facebook user', async () => {
    fbAuth.user = { name: 'Ana' }
    logout.mockImplementation(
      (callback: (response: fb.StatusResponse) => void) => {
        callback(unknownResponse)
      },
    )

    await expect(logoutFromFacebook()).resolves.toEqual(unknownResponse)

    expect(logout).toHaveBeenCalledOnce()
    expect(fbAuth.status).toBe('unknown')
    expect(fbAuth.authResponse).toBeNull()
    expect(fbAuth.user).toBeNull()
  })
})
