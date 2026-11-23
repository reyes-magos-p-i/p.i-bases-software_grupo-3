import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { requireEmployeeSession } from '@/router/employee-session.guard'
import { employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'

vi.mock('@/services/employee-session.service', () => ({
  employeeSession: { user: { value: null }, status: { value: 'unknown' } },
  restoreEmployeeSession: vi.fn(),
}))

describe('employee route guard', () => {
  let router: Router
  beforeEach(() => {
    vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue(null)
    Object.assign(employeeSession.user, { value: null })
    Object.assign(employeeSession.status, { value: 'unknown' })
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p>Portal</p>' } },
        {
          path: '/dashboard',
          component: { template: '<p>Dashboard</p>' },
          meta: { requiresEmployee: true },
        },
        { path: '/dev/dashboard', redirect: '/dashboard' },
        {
          path: '/privacy-policy',
          component: { template: '<p>Privacidad</p>' },
          meta: { publicLegal: true },
        },
        { path: '/recover-password', component: { template: '<p>Recuperación</p>' } },
      ],
    })
    router.beforeEach(requireEmployeeSession)
  })
  afterEach(() => router.options.history.destroy())

  it('checks a guest session before showing the portal', async () => {
    await router.push('/')
    expect(restoreEmployeeSession).toHaveBeenCalledExactlyOnceWith(false)
    expect(router.currentRoute.value.path).toBe('/')
  })

  it.each(['ADMINISTRATOR', 'EMPLOYEE'] as const)(
    'redirects a restored %s from the portal before confirming navigation',
    async (role) => {
      vi.mocked(restoreEmployeeSession).mockResolvedValue({ id: 21, role, firstName: 'Ana' })
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/dashboard')
      expect(restoreEmployeeSession).toHaveBeenNthCalledWith(1, false)
      expect(restoreEmployeeSession).toHaveBeenNthCalledWith(2, true)
    },
  )

  it.each(['/privacy-policy', '/recover-password'])(
    'keeps %s accessible without redirecting staff',
    async (path) => {
      vi.mocked(restoreEmployeeSession).mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
        firstName: 'Ana',
      })
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(path)
      expect(restoreEmployeeSession).not.toHaveBeenCalled()
    },
  )

  it('keeps a public session failure recoverable without looping back to the dashboard', async () => {
    vi.mocked(restoreEmployeeSession).mockImplementation(async () => {
      Object.assign(employeeSession.status, { value: 'error' })
      throw new Error('Offline')
    })
    await router.push('/dashboard')
    expect(router.currentRoute.value.query).toEqual({ login: 'employee', reason: 'unavailable' })
    expect(restoreEmployeeSession).toHaveBeenCalledTimes(1)
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
    expect(restoreEmployeeSession).toHaveBeenCalledTimes(2)
  })

  it.each(['ADMINISTRATOR', 'EMPLOYEE'] as const)('accepts a verified %s session', async (role) => {
    vi.mocked(restoreEmployeeSession).mockResolvedValue({ id: 21, role, firstName: 'Ana' })
    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(restoreEmployeeSession).toHaveBeenCalledWith(true)
  })

  it.each(['/dashboard', '/dev/dashboard'])(
    'redirects %s to employee login without a session',
    async (path) => {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe('/')
      expect(router.currentRoute.value.query).toEqual({ login: 'employee', reason: 'required' })
    },
  )

  it('does not render a protected page before recovery finishes', async () => {
    await router.push('/')
    let resolve!: (value: null) => void
    vi.mocked(restoreEmployeeSession).mockReturnValueOnce(
      new Promise((res) => {
        resolve = res
      }),
    )
    const navigation = router.push('/dashboard')
    await Promise.resolve()
    expect(router.currentRoute.value.path).toBe('/')
    resolve(null)
    await navigation
    expect(router.currentRoute.value.query.login).toBe('employee')
  })

  it('distinguishes an expired session from a temporary backend failure', async () => {
    Object.assign(employeeSession.user, { value: { id: 21, role: 'EMPLOYEE', firstName: 'Ana' } })
    await router.push('/dashboard')
    expect(router.currentRoute.value.query.reason).toBe('expired')
    vi.mocked(restoreEmployeeSession).mockRejectedValue(new Error('Offline'))
    await router.push('/dashboard')
    expect(router.currentRoute.value.query.reason).toBe('unavailable')
  })
})
