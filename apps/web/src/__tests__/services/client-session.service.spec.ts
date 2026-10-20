import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearClientSession,
  clearClientAuth,
  clientIdentityFromResponse,
  clientSession,
  establishClientSession,
  hasClientSession,
  clientSessionRevision,
  beginClientSessionChange,
  restoreClientSession,
} from '@/services/client-session.service'
import { fbAuth, logoutFromFacebook } from '@/facebook-auth'

vi.mock('@/facebook-auth', () => ({
  fbAuth: { status: 'unknown' },
  logoutFromFacebook: vi.fn(),
}))

const identity = { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' }

describe('Client session lifecycle', () => {
  beforeEach(() => {
    fbAuth.status = 'unknown'
    vi.mocked(logoutFromFacebook).mockReset().mockResolvedValue(undefined)
    clearClientSession()
  })

  it('detects application tokens without treating Facebook SDK status as a session', () => {
    expect(hasClientSession()).toBe(false)
    localStorage.setItem('accessToken', 'saved-token')
    expect(hasClientSession()).toBe(true)
    clearClientSession()
    fbAuth.status = 'connected'
    expect(hasClientSession()).toBe(false)
  })

  it('clears a local session without calling Facebook when disconnected', async () => {
    establishClientSession(identity, 'local-token')
    await clearClientAuth()
    expect(logoutFromFacebook).not.toHaveBeenCalled()
    expect(clientSession.status.value).toBe('anonymous')
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('logs out of Facebook and prevents a late restoration from restoring the client', async () => {
    establishClientSession(identity, 'social-token')
    fbAuth.status = 'connected'
    let resolve!: (value: typeof identity) => void
    const pending = restoreClientSession(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await Promise.resolve()
    await clearClientAuth()
    resolve(identity)
    await expect(pending).resolves.toBeNull()
    expect(logoutFromFacebook).toHaveBeenCalledExactlyOnceWith()
    expect(clientSession.status.value).toBe('anonymous')
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('restores a saved token through the server and shares concurrent lookups', async () => {
    localStorage.setItem('accessToken', 'saved-token')
    const load = vi.fn().mockResolvedValue(identity)
    const first = restoreClientSession(load)
    expect(restoreClientSession(load)).toBe(first)
    await expect(first).resolves.toEqual(identity)
    expect(load).toHaveBeenCalledExactlyOnceWith('saved-token')
    expect(clientSession.user.value).toEqual(identity)
    expect(clientSession.status.value).toBe('authenticated')
  })

  it('does not request a session without a stored token', async () => {
    const load = vi.fn()
    await expect(restoreClientSession(load)).resolves.toBeNull()
    expect(load).not.toHaveBeenCalled()
    expect(clientSession.status.value).toBe('anonymous')
  })

  it('removes credentials rejected by the server', async () => {
    establishClientSession(identity, 'expired-token')
    await expect(restoreClientSession(vi.fn().mockResolvedValue(null))).resolves.toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(clientSession.user.value).toBeNull()
  })

  it('preserves the token on network failure and permits recovery', async () => {
    establishClientSession(identity, 'saved-token')
    const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(identity)
    await expect(restoreClientSession(load)).rejects.toThrow('Offline')
    expect(clientSession.status.value).toBe('error')
    expect(clientSession.user.value).toBeNull()
    expect(localStorage.getItem('accessToken')).toBe('saved-token')
    await expect(restoreClientSession(load)).resolves.toEqual(identity)
  })

  it.each(['logout', 'login'] as const)(
    'discards an old response after a newer %s',
    async (action) => {
      establishClientSession(identity, 'old-token')
      let resolve!: (value: typeof identity) => void
      const pending = restoreClientSession(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      await Promise.resolve()
      const newer = { ...identity, id: 8, firstName: 'Luis' }
      if (action === 'logout') clearClientSession()
      else establishClientSession(newer, 'new-token')
      resolve(identity)
      await pending
      expect(clientSession.user.value).toEqual(action === 'logout' ? null : newer)
      expect(localStorage.getItem('accessToken')).toBe(action === 'logout' ? null : 'new-token')
    },
  )

  it('ignores a stale failure after logout', async () => {
    establishClientSession(identity, 'old-token')
    let reject!: (error: Error) => void
    const pending = restoreClientSession(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    await Promise.resolve()
    clearClientSession()
    reject(new Error('Late failure'))
    await expect(pending).resolves.toBeNull()
    expect(clientSession.status.value).toBe('anonymous')
  })

  it('skips a scheduled restoration if a new login already established a session', async () => {
    const load = vi.fn()
    const pending = restoreClientSession(load)
    establishClientSession(identity, 'new-token')
    await expect(pending).resolves.toEqual(identity)
    expect(load).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { ...identity, id: 0 },
    { ...identity, role: 'EMPLOYEE' },
    { ...identity, email: '' },
    { ...identity, firstName: ' ' },
    { ...identity, lastName: 3 },
  ])('rejects an invalid client profile: %p', (value) => {
    expect(() => clientIdentityFromResponse(value)).toThrow('AUTH_RESPONSE_INVALID')
  })

  it('maps the current API surname and keeps only public identity fields', () => {
    expect(
      clientIdentityFromResponse({
        id: 7,
        email: identity.email,
        firstName: 'Ana',
        firstSurname: 'Rojas',
        status: 'ACTIVE',
      }),
    ).toEqual(identity)
    expect(
      clientIdentityFromResponse({
        id: 7,
        email: identity.email,
        firstName: 'Ana',
        firstSurname: null,
      }).lastName,
    ).toBe('')
  })

  it('does not replace an existing session with an empty token', () => {
    establishClientSession(identity, 'valid-token')
    expect(() => establishClientSession(identity, '')).toThrow('AUTH_RESPONSE_INVALID')
    expect(localStorage.getItem('accessToken')).toBe('valid-token')
  })

  it('clears local access even if the Facebook logout fails', async () => {
    establishClientSession(identity, 'saved-token')
    fbAuth.status = 'connected'
    vi.mocked(logoutFromFacebook).mockRejectedValueOnce(new Error('SDK unavailable'))
    await expect(clearClientAuth()).rejects.toThrow('SDK unavailable')
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(clientSession.user.value).toBeNull()
  })

  it('keeps the initial anonymous restoration from cancelling automatic provider login', async () => {
    const revision = clientSessionRevision()
    await restoreClientSession(vi.fn())
    expect(clientSessionRevision()).toBe(revision)
    expect(clientSession.status.value).toBe('anonymous')
    expect(beginClientSessionChange()).toBe(revision + 1)
  })

  it('clears a profile that no longer has its application token', async () => {
    establishClientSession(identity, 'old-token')
    localStorage.removeItem('accessToken')
    await restoreClientSession(vi.fn())
    expect(clientSession.user.value).toBeNull()
    expect(clientSession.status.value).toBe('anonymous')
  })
})
