import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import { requireClientSession } from '@/router/client-session.guard'
import { clearClientSession, establishClientSession } from '@/services/client-session.service'
import {
  getClientPasswordStatus,
  getClientSession,
  loginClient,
} from '@/services/authService'
import { closeEmployeeSession, employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'

vi.mock('@/services/authService', async (original) => ({
  ...(await original<typeof import('@/services/authService')>()),
  loginClient: vi.fn(),
  getClientSession: vi.fn(),
  getClientPasswordStatus: vi.fn(),
}))
vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  return {
    employeeSession: { user: ref(null), status: ref('unknown'), error: ref('') },
    authenticateEmployee: vi.fn(),
    closeEmployeeSession: vi.fn().mockResolvedValue(undefined),
    restoreEmployeeSession: vi.fn(),
  }
})

const identity = { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' }
const TICKET_PAGE = '/cancelled-tickets/721'

/** A successful login leaves a client session behind, as the real service does. */
function signInOnLogin() {
  vi.mocked(getClientSession).mockResolvedValue(identity)
  vi.mocked(loginClient).mockImplementation(() => {
    establishClientSession(identity, 'client-token')
    return Promise.resolve(identity)
  })
}

describe('AppHeader login return for cancelled-ticket pages', () => {
  let wrapper: VueWrapper
  let router: Router
  const prototype = HTMLDialogElement.prototype

  beforeEach(async () => {
    clearClientSession()
    vi.mocked(loginClient).mockReset()
    vi.mocked(getClientSession).mockReset().mockResolvedValue(null)
    vi.mocked(getClientPasswordStatus).mockReset().mockResolvedValue({
      status: 'valid',
      expirationDays: 120,
      expiresInDays: null,
    })
    vi.mocked(closeEmployeeSession).mockResolvedValue(null)
    vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue(null)
    Object.assign(employeeSession.user, { value: null })
    Object.assign(employeeSession.status, { value: 'unknown' })
    Object.defineProperties(prototype, {
      showModal: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = true
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = false
        },
      },
    })
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p>Portal</p>' } },
        {
          path: TICKET_PAGE,
          meta: { requiresClient: true, returnAfterLogin: true },
          component: { template: '<p>Boleto</p>' },
        },
        { path: '/account/profile', meta: { requiresClient: true }, component: { template: '<p>Perfil</p>' } },
      ],
    })
    router.beforeEach(requireClientSession)
    await router.push('/')
    await router.isReady()
    wrapper = mount(AppHeader, { attachTo: document.body, global: { plugins: [router] } })
  })

  afterEach(() => {
    wrapper.unmount()
    vi.clearAllMocks()
  })

  async function loginFrom(path: string) {
    await router.push(path)
    await flushPromises()
    const login = wrapper.getComponent(LoginModal)
    if (login.props('open') !== true) throw new Error('login modal did not open')
    signInOnLogin()
    login.vm.$emit('submit', { email: identity.email, password: 'valid-secret' })
    await flushPromises()
  }

  it('returns a logged-out visitor to the cancelled-ticket page after login', async () => {
    await loginFrom(TICKET_PAGE)
    expect(router.currentRoute.value.fullPath).toBe(TICKET_PAGE)
  })

  it.each([
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
  ])('ignores an unsafe redirect %s and goes to the portal', async (redirect, expected) => {
    await router.push({ path: '/', query: { login: 'client', reason: 'required', redirect } })
    await flushPromises()
    const login = wrapper.getComponent(LoginModal)
    signInOnLogin()
    login.vm.$emit('submit', { email: identity.email, password: 'valid-secret' })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(expected)
  })
})
