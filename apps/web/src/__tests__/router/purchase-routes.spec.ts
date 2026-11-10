import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import router from '@/router'
import { requireClientSession } from '@/router/client-session.guard'
import { clearClientSession } from '@/services/client-session.service'
vi.mock('@/views/HomeView.vue', () => ({ default: { template: '<p>Portal</p>' } }))
vi.mock('@/services/authService', () => ({
  getClientPasswordStatus: vi.fn(),
  getClientSession: vi.fn(),
}))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
describe('Purchase route boundaries', () => {
  beforeEach(() => clearClientSession())
  afterAll(() => router.options.history.destroy())
  it.each(['/buy-tickets?movieId=2', '/guest-purchases/receipt#12.4AVG75NWK52Z476W4QDMW7DYQE'])(
    'allows an anonymous visitor to enter %s',
    async (path) => {
      const to = router.resolve(path) as unknown as Parameters<typeof requireClientSession>[0]
      expect(to.meta.requiresClient).not.toBe(true)
      expect(await requireClientSession(to, router.currentRoute.value, vi.fn())).toBe(true)
      expect(to.matched).toHaveLength(1)
    },
  )
  it('removes the manual consultation page', () => {
    expect(router.resolve('/guest-purchases').name).toBe('NotFound')
    expect(router.resolve('/guest-purchases/receipt').name).toBe('guest-purchase-receipt')
  })
  it.each(['/account/profile', '/account/password'])(
    'continues requiring a client identity for %s',
    async (path) => {
      const to = router.resolve(path) as unknown as Parameters<typeof requireClientSession>[0]
      expect(to.meta.requiresClient).toBe(true)
      expect(await requireClientSession(to, router.currentRoute.value, vi.fn())).toEqual({
        path: '/',
        query: { login: 'client', reason: 'required' },
      })
    },
  )
})
