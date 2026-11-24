import {
  beginClientSessionChange,
  clearClientSession,
  establishClientSession,
} from '@/services/client-session.service'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'
import { getPortalMovies } from '@/services/movieFunctions'
import { employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'
import type { EmployeeIdentity } from '@/types/employee-auth'

vi.mock('@/views/DashboardView.vue', () => ({ default: { template: '<p>Panel del personal</p>' } }))

vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  return {
    employeeSession: { user: ref(null), status: ref('unknown'), error: ref('') },
    restoreEmployeeSession: vi.fn().mockResolvedValue(null),
    authenticateEmployee: vi.fn(),
  }
})
vi.mock('@/services/movieFunctions', async (original) => ({
  ...(await original<typeof import('@/services/movieFunctions')>()),
  getPortalMovies: vi.fn().mockResolvedValue([]),
}))

describe('App', () => {
  afterEach(() => {
    clearClientSession()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.mocked(getPortalMovies).mockResolvedValue([])
    Object.assign(employeeSession.user, { value: null })
    Object.assign(employeeSession.status, { value: 'unknown' })
    vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue(null)
  })

  it.each(['/api', '/api/'])(
    'loads catalog and carousel images through the API with API base %s',
    async (baseUrl) => {
      vi.stubEnv('VITE_API_BASE_URL', baseUrl)
      vi.mocked(getPortalMovies).mockResolvedValue([
        { id: 1, title: 'Test movie', posterImage: 'poster.png' },
      ])

      await router.push('/')
      await router.isReady()

      const wrapper = mount(App, { global: { plugins: [router] } })

      try {
        await flushPromises()

        expect(
          wrapper.findAll('img[src$="/api/image-handler/posters/poster.png"]').length,
        ).toBeGreaterThanOrEqual(2)
      } finally {
        wrapper.unmount()
      }
    },
  )

  it('renders the home page through the router', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Iniciar sesión')
    wrapper.unmount()
  })
  it('shares one ordered catalog between the four-slide carousel and all movie cards after login and logout', async () => {
    const general = Array.from({ length: 6 }, (_item, index) => ({
      id: index + 1,
      title: `Película ${index + 1}`,
      posterImage: `${index + 1}.jpg`,
    }))
    const preferred = [general[5]!, ...general.slice(0, 5)]
    vi.mocked(getPortalMovies).mockImplementation((personalized) =>
      Promise.resolve(personalized ? preferred : general),
    )
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      await flushPromises()
      expect(wrapper.findAll('.movie-card')).toHaveLength(6)
      expect(wrapper.findAll('.indicator')).toHaveLength(4)
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Póster de Película 1')
      expect(getPortalMovies).toHaveBeenCalledTimes(1)
      establishClientSession(
        { id: 7, firstName: 'Ana', lastName: '', email: 'a@example.com' },
        'token',
      )
      await flushPromises()
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Póster de Película 6')
      expect(wrapper.get('.movie-card img').attributes('alt')).toBe('Póster de Película 6')
      expect(wrapper.findAll('.movie-card')).toHaveLength(6)
      clearClientSession()
      await flushPromises()
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Póster de Película 1')
      expect(vi.mocked(getPortalMovies).mock.calls.map(([personalized]) => personalized)).toEqual([
        false,
        true,
        false,
      ])
    } finally {
      wrapper.unmount()
    }
  })
  it('renders the public catalog when an anonymous session operation finishes during loading', async () => {
    clearClientSession()
    let finish!: (movies: Awaited<ReturnType<typeof getPortalMovies>>) => void
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      beginClientSessionChange()
      finish([{ id: 1, title: 'Cartelera pública', posterImage: 'public.jpg' }])
      await flushPromises()
      expect(wrapper.get('.movie-card').text()).toContain('Cartelera pública')
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Póster de Cartelera pública')
      expect(wrapper.text()).not.toContain('No hay películas disponibles')
      expect(getPortalMovies).toHaveBeenCalledExactlyOnceWith(false, expect.any(AbortSignal))
    } finally {
      wrapper.unmount()
    }
  })
  it('opens the purchase route for a guest without requiring a client session', async () => {
    clearClientSession()
    await router.push('/buy-tickets?movieId=2')
    expect(router.currentRoute.value.path).toBe('/buy-tickets')
    expect(router.currentRoute.value.query).toEqual({ movieId: '2' })
    const matched = router.resolve('/buy-tickets?movieId=2').matched[0]!
    expect(matched.meta.requiresClient).not.toBe(true)
    expect(matched.components!.default).toMatchObject({ __name: 'TicketPurchaseView' })
  })

  it.each(['ADMINISTRATOR', 'EMPLOYEE'] as const)(
    'never mounts the portal while restoring a %s session',
    async (role) => {
      await router.push('/privacy-policy')
      let finish!: (identity: EmployeeIdentity) => void
      const pending = new Promise<EmployeeIdentity>((resolve) => {
        finish = resolve
      })
      vi.mocked(restoreEmployeeSession).mockReturnValue(pending)
      localStorage.setItem('accessToken', 'older-client-token')
      const navigation = router.push('/')
      const wrapper = mount(App, { global: { plugins: [router] } })
      try {
        await flushPromises()
        expect(wrapper.findComponent({ name: 'HomeView' }).exists()).toBe(false)
        expect(getPortalMovies).not.toHaveBeenCalled()
        finish({ id: 21, role, firstName: 'Ana' })
        await navigation
        await flushPromises()
        expect(router.currentRoute.value.path).toBe('/dashboard')
        expect(wrapper.text()).toContain('Panel del personal')
        expect(getPortalMovies).not.toHaveBeenCalled()
      } finally {
        wrapper.unmount()
      }
    },
  )
})
