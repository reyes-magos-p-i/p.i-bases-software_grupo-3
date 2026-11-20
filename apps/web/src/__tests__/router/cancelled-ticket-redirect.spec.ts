import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireClientSession } from '@/router/client-session.guard'
import { clearClientSession } from '@/services/client-session.service'
import { getClientSession } from '@/services/authService'

vi.mock('@/services/authService', () => ({
  getClientPasswordStatus: vi.fn(),
  getClientSession: vi.fn(),
}))

const PAGE = '/cancelled-tickets/721?from=email'

function route(fullPath: string, meta: Record<string, unknown>) {
  return {
    path: fullPath.split('?')[0],
    fullPath,
    meta: { requiresClient: true, ...meta },
  } as unknown as Parameters<typeof requireClientSession>[0]
}

describe('login return for cancelled-ticket pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearClientSession()
    localStorage.setItem('accessToken', 'saved-token')
    vi.mocked(getClientSession).mockResolvedValue(null)
  })

  it('sends a logged-out visitor back to the requested page after login', async () => {
    const result = await requireClientSession(
      route(PAGE, { returnAfterLogin: true }),
      route('/', {}),
      vi.fn(),
    )
    expect(result).toEqual({
      path: '/',
      query: { login: 'client', reason: 'required', redirect: PAGE },
    })
  })

  it('keeps the requested page after an expired session on a flagged route', async () => {
    vi.mocked(getClientSession).mockRejectedValueOnce(
      Object.assign(new Error('expired'), { status: 401 }),
    )
    const result = await requireClientSession(
      route(PAGE, { returnAfterLogin: true }),
      route('/', {}),
      vi.fn(),
    )
    expect(result).toEqual({
      path: '/',
      query: { login: 'client', reason: 'expired', redirect: PAGE },
    })
  })

  it('keeps the requested page when the session check is unavailable on a flagged route', async () => {
    vi.mocked(getClientSession).mockRejectedValueOnce(new Error('offline'))
    const result = await requireClientSession(
      route(PAGE, { returnAfterLogin: true }),
      route('/', {}),
      vi.fn(),
    )
    expect(result).toEqual({
      path: '/',
      query: { login: 'client', reason: 'unavailable', redirect: PAGE },
    })
  })

  it('does not add a redirect for other client-only pages', async () => {
    const result = await requireClientSession(
      route('/account/profile?section=purchases&purchaseId=12', {}),
      route('/', {}),
      vi.fn(),
    )
    expect(result).toEqual({
      path: '/',
      query: { login: 'client', reason: 'required' },
    })
  })
})
