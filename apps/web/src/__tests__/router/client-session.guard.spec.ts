import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  redirectClientWhenPasswordBlocked,
  requireClientSession,
} from '@/router/client-session.guard'
import { notifyPasswordBlocked } from '@/services/api'
import type { Router } from 'vue-router'
import { clientSession, clearClientSession } from '@/services/client-session.service'
import { getClientPasswordStatus, getClientSession } from '@/services/authService'
import type { PasswordExpiry } from '@/services/authService'

vi.mock('@/services/authService', () => ({
  getClientPasswordStatus: vi.fn(),
  getClientSession: vi.fn(),
}))

function route(path: string, requiresClient = false) {
  return { path, meta: { requiresClient } } as unknown as Parameters<typeof requireClientSession>[0]
}

const expiry = (
  status: PasswordExpiry['status'],
  expirationDays: number | null = 120,
  expiresInDays: number | null = null,
): PasswordExpiry => ({ status, expirationDays, expiresInDays })

describe('requireClientSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearClientSession()
    localStorage.setItem('accessToken', 'saved-token')
    vi.mocked(getClientSession).mockImplementation(() => Promise.resolve(clientSession.user.value))
  })

  it('blocks access to /account/password without a client session', async () => {
    const result = await requireClientSession(
      route('/account/password', true),
      route('/', false),
      vi.fn(),
    )
    expect(result).toEqual({ path: '/', query: { login: 'client', reason: 'required' } })
  })

  it('keeps recovery accessible even when an existing session has an expired password', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockResolvedValue(expiry('expired'))
    await expect(
      requireClientSession(route('/recover-password'), route('/'), vi.fn()),
    ).resolves.toBe(true)
    expect(getClientPasswordStatus).not.toHaveBeenCalled()
  })

  it('allows navigation with no client session on a non-protected route', async () => {
    const result = await requireClientSession(route('/'), route('/', false), vi.fn())
    expect(result).toBe(true)
  })

  it('restores a stored session on a direct page load and redirects before showing the page', async () => {
    const identity = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientSession).mockResolvedValueOnce(identity)
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce(expiry('expired'))
    const result = await requireClientSession(route('/privacy-policy'), route('/', false), vi.fn())
    expect(getClientSession).toHaveBeenCalledWith('saved-token')
    expect(result).toEqual({ path: '/account/password', query: { reason: 'expired' } })
  })

  it('forces a redirect to /account/password when the password is expired', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce(expiry('expired'))
    const result = await requireClientSession(route('/'), route('/', false), vi.fn())
    expect(result).toEqual({ path: '/account/password', query: { reason: 'expired' } })
  })

  it('does not redirect when already headed to /account/password', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    const result = await requireClientSession(
      route('/account/password', true),
      route('/', false),
      vi.fn(),
    )
    expect(result).toBe(true)
    expect(getClientPasswordStatus).not.toHaveBeenCalled()
  })

  it('does not block navigation when the status check fails', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockRejectedValueOnce(new Error('network'))
    const result = await requireClientSession(route('/'), route('/', false), vi.fn())
    expect(result).toBe(true)
  })

  it('rejects an expired stored token before entering a protected page', async () => {
    vi.mocked(getClientSession).mockResolvedValueOnce(null)
    const result = await requireClientSession(route('/account/password', true), route('/'), vi.fn())
    expect(result).toEqual({ path: '/', query: { login: 'client', reason: 'required' } })
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('returns to client login after the server revokes an active session', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockRejectedValueOnce(
      Object.assign(new Error('expired'), { status: 401 }),
    )
    const result = await requireClientSession(route('/'), route('/'), vi.fn())
    expect(result).toEqual({ path: '/', query: { login: 'client', reason: 'expired' } })
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('blocks protected navigation when session verification is unavailable', async () => {
    vi.mocked(getClientSession).mockRejectedValueOnce(new Error('offline'))
    const result = await requireClientSession(route('/account/password', true), route('/'), vi.fn())
    expect(result).toEqual({ path: '/', query: { login: 'client', reason: 'unavailable' } })
    expect(localStorage.getItem('accessToken')).toBe('saved-token')
  })

  it('does not clear a newer login after a stale unauthorized response', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockImplementationOnce(() => {
      localStorage.setItem('accessToken', 'new-token')
      return Promise.reject(Object.assign(new Error('expired'), { status: 401 }))
    })
    const result = await requireClientSession(route('/'), route('/'), vi.fn())
    expect(result).toBe(false)
    expect(localStorage.getItem('accessToken')).toBe('new-token')
  })
})

describe('redirectClientWhenPasswordBlocked', () => {
  const blocked = (code: string) => ({
    isAxiosError: true,
    response: { status: 403, data: { code } },
  })
  const fakeRouter = (path: string) =>
    ({ currentRoute: { value: { path } }, replace: vi.fn() }) as unknown as Router & {
      replace: ReturnType<typeof vi.fn>
    }

  it.each([
    ['PASSWORD_EXPIRED', 'expired'],
    ['PASSWORD_MUST_SET', 'must_set'],
  ])('sends a client to the password change when an endpoint answers %s', (code, reason) => {
    localStorage.setItem('accessToken', 'saved-token')
    const router = fakeRouter('/')
    const stop = redirectClientWhenPasswordBlocked(router)
    notifyPasswordBlocked(blocked(code))
    stop()
    expect(router.replace).toHaveBeenCalledWith({ path: '/account/password', query: { reason } })
  })

  it.each([
    ['a staff session (no client token)', null, '/dashboard'],
    ['a client already on the password change', 'saved-token', '/account/password'],
  ])('does nothing for %s', (_, token, path) => {
    if (token) localStorage.setItem('accessToken', token)
    else localStorage.removeItem('accessToken')
    const router = fakeRouter(path)
    const stop = redirectClientWhenPasswordBlocked(router)
    notifyPasswordBlocked(blocked('PASSWORD_EXPIRED'))
    stop()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
