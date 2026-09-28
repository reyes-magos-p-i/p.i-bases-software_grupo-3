import { describe, it, expect, vi } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  return {
    employeeSession: { user: ref(null), status: ref('unknown'), error: ref('') },
    restoreEmployeeSession: vi.fn().mockResolvedValue(null),
    authenticateEmployee: vi.fn(),
  }
})

describe('App', () => {
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
