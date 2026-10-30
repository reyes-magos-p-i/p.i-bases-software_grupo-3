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
vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  return {
    employeeSession: { user: ref(null), status: ref('unknown'), error: ref('') },
    restoreEmployeeSession: vi.fn().mockResolvedValue(null),
    authenticateEmployee: vi.fn(),
  }
})

describe('App', () => {
  afterEach(() => {
    clearClientSession()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.mocked(getPortalMovies).mockResolvedValue([])
  })

  it.each(['/api', '/api/'])('loads catalog and carousel images through %s', async (baseUrl) => {
    vi.stubEnv('VITE_API_BASE_URL', baseUrl)
    vi.mocked(getPortalMovies).mockResolvedValue([
      { id: 1, title: 'Test movie', posterImage: 'poster.png' },
    ])
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      await flushPromises()
      expect(wrapper.findAll('img[src="/api/image/poster.png"]').length).toBeGreaterThanOrEqual(2)
    } finally {
      wrapper.unmount()
    }
  })

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
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Película 1')
      expect(getPortalMovies).toHaveBeenCalledTimes(1)
      establishClientSession(
        { id: 7, firstName: 'Ana', lastName: '', email: 'a@example.com' },
        'token',
      )
      await flushPromises()
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Película 6')
      expect(wrapper.get('.movie-card img').attributes('alt')).toBe('Película 6')
      expect(wrapper.findAll('.movie-card')).toHaveLength(6)
      clearClientSession()
      await flushPromises()
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Película 1')
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
      expect(wrapper.get('.hero-image').attributes('alt')).toBe('Cartelera pública')
      expect(wrapper.text()).not.toContain('No hay películas disponibles')
      expect(getPortalMovies).toHaveBeenCalledExactlyOnceWith(false, expect.any(AbortSignal))
    } finally {
      wrapper.unmount()
    }
  })
})
