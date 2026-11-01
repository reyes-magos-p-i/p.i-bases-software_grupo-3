import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireClientSession } from '@/router/client-session.guard'
import { clientSession, clearClientSession } from '@/services/client-session.service'
import { getClientPasswordStatus, getClientSession } from '@/services/authService'

vi.mock('@/services/authService', () => ({
  getClientPasswordStatus: vi.fn(),
  getClientSession: vi.fn(),
}))

function route(path: string, requiresClient = false) {
  return { path, meta: { requiresClient } } as unknown as Parameters<typeof requireClientSession>[0]
}

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
    vi.mocked(getClientPasswordStatus).mockResolvedValue('expired')
    await expect(
      requireClientSession(route('/recover-password'), route('/'), vi.fn()),
    ).resolves.toBe(true)
    expect(getClientPasswordStatus).not.toHaveBeenCalled()
  })

  it('allows navigation with no client session on a non-protected route', async () => {
    const result = await requireClientSession(route('/'), route('/', false), vi.fn())
    expect(result).toBe(true)
  })

  it('forces a redirect to /account/password when the password is expired', async () => {
    clientSession.user.value = { id: 1, email: 'a@a.com', firstName: 'A', lastName: 'B' }
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('expired')
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
