import { afterEach, describe, it, expect, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'
import { getMovieFunctions } from '@/services/movieFunctions'

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
  getMovieFunctions: vi.fn().mockResolvedValue([]),
}))

describe('App', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(getMovieFunctions).mockResolvedValue([])
  })

  it.each(['/api', '/api/'])('loads catalog and carousel images through %s', async (baseUrl) => {
    vi.stubEnv('VITE_API_BASE_URL', baseUrl)
    vi.mocked(getMovieFunctions).mockResolvedValue([
      { title: 'Test movie', posterImage: 'poster.png' },
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
})
