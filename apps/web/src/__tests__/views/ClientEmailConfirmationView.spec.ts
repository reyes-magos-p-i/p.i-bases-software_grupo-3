import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import ClientEmailConfirmationView from '@/views/ClientEmailConfirmationView.vue'
import { confirmClientEmailChange } from '@/services/client-profile.service'
import {
  clearClientSession,
  clientSession,
  establishClientSession,
} from '@/services/client-session.service'

const route = vi.hoisted(() => ({ hash: '#signed-token' }))
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/client-profile.service', async () => ({
  ...(await vi.importActual<typeof import('@/services/client-profile.service')>(
    '@/services/client-profile.service',
  )),
  confirmClientEmailChange: vi.fn(),
}))

describe('ClientEmailConfirmationView', () => {
  const wrappers: VueWrapper[] = []
  beforeEach(() => {
    vi.resetAllMocks()
    route.hash = '#signed-token'
    clearClientSession()
    vi.mocked(confirmClientEmailChange).mockResolvedValue({ clientId: 7 })
  })
  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    wrappers.length = 0
    clearClientSession()
  })
  const login = (id = 7) =>
    establishClientSession(
      { id, firstName: 'Ana', lastName: '', email: 'old@example.com' },
      `token-${id}`,
    )
  function render() {
    const wrapper = mount(ClientEmailConfirmationView, {
      global: {
        stubs: { AppHeader: true, AppFooter: true, RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }
  it('requires an explicit confirmation and closes the corresponding local session', async () => {
    login()
    const wrapper = render()
    expect(confirmClientEmailChange).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('30 minutos')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(confirmClientEmailChange).toHaveBeenCalledWith('signed-token')
    expect(clientSession.user.value).toBeNull()
    expect(wrapper.text()).toContain('Correo actualizado')
    expect(wrapper.text()).toContain('Iniciar sesión')
  })
  it.each(['', '#' + 'a'.repeat(4097)])(
    'rejects missing or oversized links %p locally',
    async (hash) => {
      route.hash = hash
      const wrapper = render()
      await wrapper.get('button').trigger('click')
      expect(confirmClientEmailChange).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('El enlace no es válido')
    },
  )
  it('can confirm with no local session without logging in automatically', async () => {
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Correo actualizado')
    expect(clientSession.user.value).toBeNull()
  })
  it('preserves another account already signed in', async () => {
    login(8)
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(clientSession.user.value?.id).toBe(8)
  })
  it('keeps an invalid or expired link failure actionable', async () => {
    vi.mocked(confirmClientEmailChange).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: 'El enlace venció. Solicita otro.' } },
    })
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('El enlace venció. Solicita otro.')
    expect(wrapper.text()).not.toContain('Correo actualizado')
    wrapper.getComponent(NotificationPopup).vm.$emit('close')
    await flushPromises()
    expect(wrapper.text()).not.toContain('El enlace venció. Solicita otro.')
  })
  it('blocks duplicates and preserves a newer session when confirmation is delayed', async () => {
    let resolve!: (value: { clientId: number }) => void
    vi.mocked(confirmClientEmailChange).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    login()
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    expect(confirmClientEmailChange).toHaveBeenCalledTimes(1)
    login()
    resolve({ clientId: 7 })
    await flushPromises()
    expect(clientSession.user.value?.id).toBe(7)
  })
  it('ignores a completion after unmounting', async () => {
    let resolve!: (value: { clientId: number }) => void
    vi.mocked(confirmClientEmailChange).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    login()
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    wrapper.unmount()
    wrappers.length = 0
    resolve({ clientId: 7 })
    await flushPromises()
    expect(clientSession.user.value?.id).toBe(7)
  })
})
