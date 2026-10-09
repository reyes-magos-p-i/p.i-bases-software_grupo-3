import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import {
  ClientAuthError,
  EmployeeAuthError,
  getClientPasswordStatus,
  getClientSession,
  loginClient,
} from '@/services/authService'
import {
  authenticateEmployee,
  closeEmployeeSession,
  employeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import { clearClientSession } from '@/services/client-session.service'

vi.mock('@/services/authService', async (original) => ({
  ...(await original<typeof import('@/services/authService')>()),
  registerUser: vi.fn(),
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

describe('AppHeader authentication navigation', () => {
  let wrapper: VueWrapper
  let router: Router
  const page = new DOMWrapper(document.body)
  const prototype = HTMLDialogElement.prototype
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')

  function renderHeader() {
    return mount(AppHeader, { attachTo: document.body, global: { plugins: [router] } })
  }

  beforeEach(async () => {
    clearClientSession()
    vi.mocked(loginClient)
      .mockReset()
      .mockResolvedValue({ id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' })
    vi.mocked(getClientSession).mockReset().mockResolvedValue(null)
    vi.mocked(getClientPasswordStatus).mockReset().mockResolvedValue('valid')
    vi.mocked(closeEmployeeSession).mockResolvedValue(null)
    Object.assign(employeeSession.user, { value: null })
    Object.assign(employeeSession.status, { value: 'unknown' })
    vi.mocked(authenticateEmployee)
      .mockReset()
      .mockResolvedValue({ id: 21, role: 'ADMINISTRATOR', firstName: 'Ana' })
    vi.mocked(restoreEmployeeSession).mockReset().mockResolvedValue(null)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p>Portal</p>' } },
        { path: '/dashboard', component: { template: '<p>Dashboard</p>' } },
        { path: '/account/password', component: { template: '<p>Cambiar contraseña</p>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
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
    wrapper = renderHeader()
  })

  afterEach(() => {
    wrapper.unmount()
    router.options.history.destroy()
    vi.useRealTimers()
    document.body.innerHTML = ''
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    vi.restoreAllMocks()
  })

  it('navigates from the portal through both login modes and restores focus on close', async () => {
    const opener = wrapper.get<HTMLButtonElement>('.login-button')
    opener.element.focus()
    await opener.trigger('click')
    const login = wrapper.getComponent(LoginModal)
    const originalDialog = page.get('dialog[open]').element
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    expect(page.text()).toContain('Iniciar sesión con Google')
    await page.get('[name="password"]').setValue('temporary-secret')
    page.get<HTMLInputElement>('[name="email"]').element.focus()
    page
      .get('.switch-mode')
      .element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
      )
    await nextTick()
    expect(page.get('[name="email"]').attributes('aria-invalid')).toBe('false')
    expect(page.get('.field-error').attributes('aria-hidden')).toBe('true')
    await page.get('.switch-mode').trigger('click')
    await nextTick()
    expect(page.get('h2').text()).toBe('Inicio de sesión del personal')
    expect(page.get<HTMLInputElement>('[name="password"]').element.value).toBe('')
    expect(page.find('.bi-google').exists()).toBe(false)
    expect(document.activeElement).toBe(page.get('[name="email"]').element)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    expect(page.get('dialog[open]').element).toBe(originalDialog)
    expect(login.props('mode')).toBe('employee')
    await page.get('.switch-mode').trigger('click')
    expect(page.get('h2').text()).toBe('Iniciar sesión')
    await page.get('.app-modal-close').trigger('click')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    expect(document.activeElement).toBe(opener.element)
    expect(document.body.style.position).toBe('')
  })

  it('resets to client login on reopening and closes through native Escape', async () => {
    await wrapper.get('.login-button').trigger('click')
    await page.get('.switch-mode').trigger('click')
    await page.get('dialog[open]').trigger('cancel')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.login-button').trigger('click')
    expect(page.get('h2').text()).toBe('Iniciar sesión')
  })

  it('keeps registration available and never displays it with the login dialog', async () => {
    await wrapper.get('.register-button').trigger('click')
    expect(wrapper.getComponent(RegisterModal).props('open')).toBe(true)
    expect(wrapper.getComponent(LoginModal).props('open')).toBe(false)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    await page.get('.app-modal-close').trigger('click')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.register-button').trigger('click')
    wrapper.getComponent(RegisterModal).vm.$emit('close')
    await nextTick()
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.login-button').trigger('click')
    expect(wrapper.getComponent(RegisterModal).props('open')).toBe(false)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
  })

  it('shows the signed-in client profile and clears it on logout', async () => {
    const identity = {
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Perez',
    }
    localStorage.setItem('accessToken', 'client-token')
    await wrapper.get('.register-button').trigger('click')
    wrapper.getComponent(RegisterModal).vm.$emit('authenticated', identity)
    await nextTick()

    expect(wrapper.text()).toContain('Ana Perez')
    expect(wrapper.find('.register-button').exists()).toBe(false)
    await wrapper.get('.account-avatar').trigger('click')
    expect(wrapper.get('.account-dropdown').text()).toContain('ana@example.com')
    expect(wrapper.findAll('.account-actions button:disabled')).toHaveLength(2)

    await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')
    await flushPromises()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(closeEmployeeSession).toHaveBeenCalledExactlyOnceWith()
    expect(wrapper.find('.account-avatar').exists()).toBe(false)
    expect(wrapper.find('.register-button').exists()).toBe(true)
  })

  it('shows a client profile after social authentication in the login dialog', async () => {
    const identity = {
      id: 8,
      email: 'luis@example.com',
      firstName: 'Luis',
      lastName: 'Mora',
    }
    await wrapper.get('.login-button').trigger('click')
    wrapper.getComponent(LoginModal).vm.$emit('authenticated', identity)
    await nextTick()

    expect(wrapper.text()).toContain('Luis Mora')
    expect(wrapper.find('.account-avatar').exists()).toBe(true)
    expect(wrapper.find('.login-button[type="button"]').exists()).toBe(false)
  })

  async function employeeForm() {
    await wrapper.get('.login-button').trigger('click')
    await page.get('.switch-mode').trigger('click')
    await page.get('[name="email"]').setValue(' Staff@Example.com ')
    await page.get('[name="password"]').setValue(' Exact password ')
  }

  async function clientForm() {
    await wrapper.get('.login-button').trigger('click')
    await page.get('[name="email"]').setValue(' Ana@Example.com ')
    await page.get('[name="password"]').setValue(' Exact password ')
  }

  it('enables local client login and redirects back to the portal', async () => {
    await router.push('/?from=other-page')
    await clientForm()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(loginClient).toHaveBeenCalledExactlyOnceWith({
      email: 'ana@example.com',
      password: ' Exact password ',
    })
    expect(authenticateEmployee).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
  })

  it('forces a client with an expired password to the password update page after login', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('expired')
    localStorage.setItem('accessToken', 'client-token')
    await wrapper.get('.login-button').trigger('click')
    await page.get('[name="email"]').setValue('ana@example.com')
    await page.get('[name="password"]').setValue('ValidPassword1!')
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(getClientPasswordStatus).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/account/password')
    expect(router.currentRoute.value.query).toEqual({ reason: 'expired' })
  })

  it('does not enforce an expired password after the client logs out during the status check', async () => {
    let resolveStatus!: (status: 'expired') => void
    vi.mocked(getClientPasswordStatus).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve
      }),
    )
    localStorage.setItem('accessToken', 'client-token')
    await wrapper.get('.login-button').trigger('click')
    await page.get('[name="email"]').setValue('ana@example.com')
    await page.get('[name="password"]').setValue('ValidPassword1!')
    await page.get('form').trigger('submit')
    await vi.waitFor(() => expect(getClientPasswordStatus).toHaveBeenCalled())

    await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')
    await flushPromises()
    resolveStatus('expired')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('.account-avatar').exists()).toBe(false)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('forces a restored client with an expired password to the password update page', async () => {
    wrapper.unmount()
    localStorage.setItem('accessToken', 'saved-token')
    vi.mocked(getClientSession).mockResolvedValue({
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Rojas',
    })
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('expired')
    wrapper = renderHeader()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/account/password')
    expect(router.currentRoute.value.query).toEqual({ reason: 'expired' })
  })

  it('keeps client failures in the dialog and allows correcting the password', async () => {
    vi.mocked(loginClient).mockRejectedValueOnce(
      new ClientAuthError('Correo o contraseña incorrectos.', 401),
    )
    await clientForm()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('incorrectos')
    await page.get('[name="password"]').setValue('corrected')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(loginClient).toHaveBeenCalledTimes(2)
    expect(page.findAll('dialog[open]')).toHaveLength(0)
  })

  it('honors client rate limits without automatic retries', async () => {
    vi.useFakeTimers()
    vi.mocked(loginClient).mockRejectedValueOnce(new ClientAuthError('Espera', 429, 2))
    await clientForm()
    await page.get('form').trigger('submit')
    await vi.advanceTimersByTimeAsync(0)
    expect(page.text()).toContain('2 segundos')
    await page.get('form').trigger('submit')
    expect(loginClient).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(page.get<HTMLButtonElement>('.login-submit').element.disabled).toBe(false)
    expect(loginClient).toHaveBeenCalledTimes(1)
  })

  it('restores the client profile after the header is mounted again', async () => {
    wrapper.unmount()
    localStorage.setItem('accessToken', 'saved-token')
    vi.mocked(getClientSession).mockResolvedValue({
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Rojas',
    })
    wrapper = renderHeader()
    await flushPromises()
    expect(getClientSession).toHaveBeenCalledWith('saved-token')
    expect(wrapper.text()).toContain('Ana Rojas')
    expect(wrapper.find('.account-avatar').exists()).toBe(true)
  })

  it('submits staff credentials once and navigates after confirmed authentication', async () => {
    await employeeForm()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(authenticateEmployee).toHaveBeenCalledExactlyOnceWith({
      email: 'staff@example.com',
      password: ' Exact password ',
    })
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
  })

  it('blocks closing, switching and repeated submission while login is pending', async () => {
    let resolve!: (value: null) => void
    vi.mocked(authenticateEmployee).mockReturnValueOnce(
      new Promise((res) => {
        resolve = res
      }),
    )
    await employeeForm()
    await page.get('form').trigger('submit')
    await page.get('form').trigger('submit')
    await page.get('dialog[open]').trigger('cancel')
    await page.get('.app-modal-close').trigger('click')
    await page.get('.switch-mode').trigger('click')
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    expect(page.get('h2').text()).toContain('personal')
    expect(page.get<HTMLButtonElement>('.app-modal-close').element.disabled).toBe(true)
    expect(authenticateEmployee).toHaveBeenCalledTimes(1)
    resolve(null)
    await flushPromises()
  })

  it('allows correcting invalid credentials and logging in without reloading or reopening', async () => {
    vi.mocked(authenticateEmployee).mockRejectedValueOnce(
      new EmployeeAuthError('Correo o contraseña incorrectos.', 401),
    )
    await employeeForm()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('incorrectos')
    expect(page.get<HTMLInputElement>('[name="email"]').element.value).toBe('Staff@Example.com')
    expect(router.currentRoute.value.path).toBe('/')
    expect(page.get<HTMLButtonElement>('.login-submit').element.disabled).toBe(false)
    expect(page.get('[role="alert"]').text()).not.toMatch(/recarga/i)
    const dialog = page.get('dialog[open]').element
    await page.get('[name="password"]').setValue('Corrected password')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(authenticateEmployee).toHaveBeenCalledTimes(2)
    expect(authenticateEmployee).toHaveBeenLastCalledWith({
      email: 'staff@example.com',
      password: 'Corrected password',
    })
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    expect(dialog.isConnected).toBe(true)
  })

  it('keeps the retry delay across closing and reopening without automatically resending', async () => {
    vi.useFakeTimers()
    vi.mocked(authenticateEmployee).mockRejectedValueOnce(new EmployeeAuthError('Espera', 429, 2))
    await employeeForm()
    await page.get('form').trigger('submit')
    await vi.advanceTimersByTimeAsync(0)
    expect(page.text()).toContain('2 segundos')
    await page.get('.app-modal-close').trigger('click')
    await employeeForm()
    await page.get('form').trigger('submit')
    expect(authenticateEmployee).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(page.get<HTMLButtonElement>('.login-submit').element.disabled).toBe(false)
    expect(authenticateEmployee).toHaveBeenCalledTimes(1)
  })

  it('opens staff login after protected route rejection and removes the request on close', async () => {
    await router.push('/?login=employee&reason=expired')
    await nextTick()
    expect(page.get('h2').text()).toContain('personal')
    expect(page.get('[role="alert"]').text()).toContain('Tu sesión terminó')
    await page.get('.app-modal-close').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.login).toBeUndefined()
  })

  it('offers the dashboard when a session is recovered', async () => {
    Object.assign(employeeSession.user, { value: { id: 21, role: 'EMPLOYEE', firstName: 'Ana' } })
    await nextTick()
    expect(wrapper.get('.dashboard-link').text()).toBe('Ir al dashboard')
    expect(wrapper.find('.login-button[type="button"]').exists()).toBe(false)
  })

  it('allows retrying session recovery without showing a false login failure', async () => {
    wrapper.unmount()
    vi.mocked(restoreEmployeeSession).mockRejectedValueOnce(new Error('Offline'))
    wrapper = renderHeader()
    await flushPromises()
    expect(wrapper.get('.session-feedback').text()).toContain('No se pudo comprobar')
    await wrapper.get('.session-feedback button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.session-feedback').exists()).toBe(false)
  })
  it('does not force a password-status redirect away from the recovery link', async () => {
    wrapper.unmount()
    router.addRoute({ path: '/recover-password', component: { template: '<p>Recovery</p>' } })
    await router.push('/recover-password')
    localStorage.setItem('accessToken', 'client-token')
    vi.mocked(getClientSession).mockResolvedValue({
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Rojas',
    })
    vi.mocked(getClientPasswordStatus).mockClear().mockResolvedValue('expired')
    wrapper = renderHeader()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/recover-password')
    expect(getClientPasswordStatus).not.toHaveBeenCalled()
  })
})
