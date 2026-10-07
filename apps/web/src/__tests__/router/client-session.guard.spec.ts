import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireClientSession } from '@/router/client-session.guard'
import { clientSession } from '@/services/client-session.service'
import { getClientPasswordStatus } from '@/services/authService'

vi.mock('@/services/authService', () => ({ getClientPasswordStatus: vi.fn() }))

function route(path: string, requiresClient = false) {
  return { path, meta: { requiresClient } } as unknown as Parameters<typeof requireClientSession>[0]
}

describe('requireClientSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientSession.user.value = null
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
})
