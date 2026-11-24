import {
  clearClientSession,
  establishClientSession,
} from '@/services/client-session.service'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'
import { getPortalSection } from '@/services/movieFunctions'
import { employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'
import type { EmployeeIdentity } from '@/types/employee-auth'
import type { PortalSection, PortalSectionMovie } from '@/types/portal'

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
  getPortalSection: vi.fn(),
}))

function movie(id: number, title: string): PortalSectionMovie {
  return {
    id,
    title,
    posterImage: `${id}.jpg`,
    synopsis: '',
    classification: 'TP',
    runningTime: 120,
    genres: ['Acción'],
    releaseDate: null,
    presaleStart: null,
  }
}

const SECTIONS: Record<PortalSection, PortalSectionMovie[]> = {
  cartelera: [movie(1, 'The Odyssey')],
  preventas: [{ ...movie(2, 'Ecos del Volcán'), releaseDate: '2026-12-04', presaleStart: '2026-11-15' }],
  estrenos: [{ ...movie(3, 'Marea Alta'), releaseDate: '2026-12-18', presaleStart: '2026-12-01' }],
}

describe('App', () => {
  beforeEach(() => {
    vi.mocked(getPortalSection).mockImplementation((section) =>
      Promise.resolve(SECTIONS[section]),
    )
  })
  afterEach(() => {
    clearClientSession()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    Object.assign(employeeSession.user, { value: null })
    Object.assign(employeeSession.status, { value: 'unknown' })
    vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue(null)
  })

  it.each(['/api', '/api/'])(
    'loads the carousel and card posters through the API with API base %s',
    async (baseUrl) => {
      vi.stubEnv('VITE_API_BASE_URL', baseUrl)
      await router.push('/')
      await router.isReady()

      const wrapper = mount(App, { global: { plugins: [router] } })

      try {
        await flushPromises()

        expect(
          wrapper.findAll('img[src$="/api/image-handler/posters/1.jpg"]').length,
        ).toBeGreaterThanOrEqual(2)
      } finally {
        wrapper.unmount()
      }
    },
  )

  it('renders the home page through the router', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Iniciar sesión')
    wrapper.unmount()
  })

  // UT-040 to UT-043: each movie in one section, the same for visitors and clients.
  it('shows Cartelera, Preventas and Estrenos, the same with or without a session', async () => {
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    const titlesOf = (section: PortalSection) =>
      wrapper.findAll(`#${section} .card-title`).map((title) => title.text())
    try {
      await flushPromises()
      expect(wrapper.findAll('.section-title').map((title) => title.text())).toEqual([
        'Cartelera',
        'Preventas',
        'Estrenos',
      ])
      expect(titlesOf('cartelera')).toEqual(['The Odyssey'])
      expect(titlesOf('preventas')).toEqual(['Ecos del Volcán'])
      expect(titlesOf('estrenos')).toEqual(['Marea Alta'])

      establishClientSession(
        { id: 7, firstName: 'Ana', lastName: '', email: 'a@example.com' },
        'token',
      )
      await flushPromises()

      expect(titlesOf('cartelera')).toEqual(['The Odyssey'])
      expect(titlesOf('preventas')).toEqual(['Ecos del Volcán'])
      expect(getPortalSection).toHaveBeenCalledTimes(3)
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
        expect(getPortalSection).not.toHaveBeenCalled()
        finish({ id: 21, role, firstName: 'Ana' })
        await navigation
        await flushPromises()
        expect(router.currentRoute.value.path).toBe('/dashboard')
        expect(wrapper.text()).toContain('Panel del personal')
        expect(getPortalSection).not.toHaveBeenCalled()
      } finally {
        wrapper.unmount()
      }
    },
  )
})
