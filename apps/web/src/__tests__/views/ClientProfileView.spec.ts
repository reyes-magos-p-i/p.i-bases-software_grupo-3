import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ClientProfileView from '@/views/ClientProfileView.vue'
import ClientProfileForm from '@/components/clients/ClientProfileForm.vue'
import ClientEmailChangeDialog from '@/components/clients/ClientEmailChangeDialog.vue'
import ConfirmationDialog from '@/components/common/ConfirmationDialog.vue'
import SectionNavigation from '@/components/common/SectionNavigation.vue'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import {
  getClientProfile,
  getClientAddressOptions,
  updateClientProfile,
  requestClientEmailChange,
  deactivateClientProfile,
} from '@/services/client-profile.service'
import {
  clearClientSession,
  clientSession,
  establishClientSession,
} from '@/services/client-session.service'
import type { ClientProfile } from '@/types/client-profile'

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  leave: undefined as undefined | (() => boolean | Promise<boolean>),
}))
vi.mock('vue-router', () => ({
  useRouter: () => navigation,
  onBeforeRouteLeave: (guard: () => boolean | Promise<boolean>) => {
    navigation.leave = guard
  },
}))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/client-profile.service', async () => ({
  ...(await vi.importActual<typeof import('@/services/client-profile.service')>(
    '@/services/client-profile.service',
  )),
  getClientProfile: vi.fn(),
  getClientAddressOptions: vi.fn(),
  updateClientProfile: vi.fn(),
  requestClientEmailChange: vi.fn(),
  deactivateClientProfile: vi.fn(),
}))

describe('ClientProfileView', () => {
  const data: ClientProfile = {
    id: 7,
    status: 'ACTIVE',
    role: 'CLIENT',
    firstName: 'Ana',
    secondName: 'María',
    firstSurname: 'Rojas',
    secondSurname: null,
    email: 'ana@example.com',
    birthday: '2000-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    phoneNumber: '88887777',
    gender: 'F',
    language: 'es',
    address: {
      id: 1,
      provinceId: 1,
      provinceName: 'San José',
      cantonId: 2,
      cantonName: 'Central',
      districtId: 3,
      districtName: 'Carmen',
      details: 'Cerca del cine',
    },
  }
  const wrappers: VueWrapper[] = []
  beforeEach(() => {
    vi.resetAllMocks()
    establishClientSession(
      { id: 7, email: data.email, firstName: 'Ana', lastName: 'Rojas' },
      'token',
    )
    vi.mocked(getClientProfile).mockResolvedValue(structuredClone(data))
    vi.mocked(getClientAddressOptions).mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
    })
    vi.mocked(updateClientProfile).mockResolvedValue()
    vi.mocked(requestClientEmailChange).mockResolvedValue()
    vi.mocked(deactivateClientProfile).mockResolvedValue()
  })
  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    wrappers.length = 0
    clearClientSession()
  })
  function render() {
    const wrapper = mount(ClientProfileView, {
      global: {
        stubs: {
          AppHeader: true,
          AppFooter: true,
          ClientProfileForm: true,
          ClientEmailChangeDialog: true,
          ConfirmationDialog: true,
          ChangePasswordView: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }
  const button = (wrapper: VueWrapper, text: string) =>
    wrapper.findAll('button').find((item) => item.text().includes(text))!
  const choose = async (wrapper: VueWrapper, section: string) => {
    wrapper.getComponent(SectionNavigation).vm.$emit('select', section)
    await flushPromises()
  }
  const confirmation = (wrapper: VueWrapper, title: string) =>
    wrapper.findAllComponents(ConfirmationDialog).find((item) => item.props('title') === title)!
  async function edit(wrapper: VueWrapper) {
    await flushPromises()
    await button(wrapper, 'Editar datos').trigger('click')
    await flushPromises()
  }

  it('loads personal data without rendering read-only inputs and updates the account identity', async () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('Cargando perfil')
    await flushPromises()
    expect(wrapper.text()).toContain('Ana María Rojas')
    expect(wrapper.text()).toContain('Cerca del cine')
    expect(wrapper.text()).toContain('Femenino')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(clientSession.user.value?.firstName).toBe('Ana')
    expect(getClientProfile).toHaveBeenCalledWith(expect.any(AbortSignal))
  })
  it('shows truthful empty values and defers preferences without fictitious content', async () => {
    vi.mocked(getClientProfile).mockResolvedValue({
      ...data,
      secondName: null,
      birthday: 'bad',
      createdAt: null,
      address: null,
      phoneNumber: null,
      gender: null,
      language: 'en',
    })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('Sin registrar')
    expect(wrapper.text()).toContain('Sin especificar')
    await choose(wrapper, 'preferences')
    expect(wrapper.text()).toContain('Inglés')
    expect(wrapper.text()).toContain('Próximamente')
    expect(wrapper.find('input').exists()).toBe(false)
  })
  it('retries profile loading after an unavailable service', async () => {
    vi.mocked(getClientProfile).mockRejectedValueOnce(new Error('offline'))
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('No se pudieron cargar tus datos')
    await button(wrapper, 'Reintentar').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Mis datos')
    expect(getClientProfile).toHaveBeenCalledTimes(2)
  })
  it('ends an expired session when loading a profile', async () => {
    vi.mocked(getClientProfile).mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    render()
    await flushPromises()
    expect(clientSession.user.value).toBeNull()
    expect(navigation.replace).toHaveBeenCalledWith({
      path: '/',
      query: { login: 'client', reason: 'expired' },
    })
  })
  it('loads address catalogs only when editing and retains the form after failed writes', async () => {
    const wrapper = render()
    await flushPromises()
    expect(getClientAddressOptions).not.toHaveBeenCalled()
    await edit(wrapper)
    expect(wrapper.getComponent(ClientProfileForm).props('profile').id).toBe(7)
    vi.mocked(updateClientProfile).mockRejectedValueOnce(new Error('offline'))
    wrapper.getComponent(ClientProfileForm).vm.$emit('save', { firstName: 'María' })
    await flushPromises()
    expect(wrapper.findComponent(ClientProfileForm).exists()).toBe(true)
    expect(wrapper.text()).toContain('No se pudieron guardar tus datos')
    expect(updateClientProfile).toHaveBeenCalledWith({ firstName: 'María' })
  })
  it('reports catalog failures without opening an incomplete form', async () => {
    vi.mocked(getClientAddressOptions).mockRejectedValue(new Error('offline'))
    const wrapper = render()
    await edit(wrapper)
    expect(wrapper.findComponent(ClientProfileForm).exists()).toBe(false)
    expect(wrapper.text()).toContain('opciones de dirección')
  })
  it('refreshes profile after successful saving and distinguishes a later refresh failure', async () => {
    const wrapper = render()
    await edit(wrapper)
    vi.mocked(getClientProfile).mockRejectedValueOnce(new Error('refresh failed'))
    wrapper.getComponent(ClientProfileForm).vm.$emit('save', { firstName: 'María' })
    await flushPromises()
    expect(updateClientProfile).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('se actualizaron correctamente')
    expect(wrapper.text()).toContain('No se pudieron cargar tus datos')
    expect(wrapper.text()).not.toContain('No se pudieron guardar')
  })
  it('confirms or cancels dirty section navigation and blocks accidental page unload', async () => {
    const wrapper = render()
    await edit(wrapper)
    wrapper.getComponent(ClientProfileForm).vm.$emit('dirty', true)
    await choose(wrapper, 'preferences')
    expect(confirmation(wrapper, 'Cambios sin guardar').props('open')).toBe(true)
    confirmation(wrapper, 'Cambios sin guardar').vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(ClientProfileForm).exists()).toBe(true)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await choose(wrapper, 'preferences')
    confirmation(wrapper, 'Cambios sin guardar').vm.$emit('confirm')
    await flushPromises()
    expect(wrapper.text()).toContain('Idioma registrado')
    expect(wrapper.findComponent(ClientProfileForm).exists()).toBe(false)
  })
  it('resolves the router guard according to the discard decision', async () => {
    const wrapper = render()
    await edit(wrapper)
    expect(navigation.leave?.()).toBe(true)
    wrapper.getComponent(ClientProfileForm).vm.$emit('dirty', true)
    const leave = navigation.leave?.()
    confirmation(wrapper, 'Cambios sin guardar').vm.$emit('cancel')
    await expect(leave).resolves.toBe(false)
    const confirmed = navigation.leave?.()
    confirmation(wrapper, 'Cambios sin guardar').vm.$emit('confirm')
    await expect(confirmed).resolves.toBe(true)
  })
  it('cancels an unchanged edit without requesting confirmation', async () => {
    const wrapper = render()
    await edit(wrapper)
    wrapper.getComponent(ClientProfileForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(ClientProfileForm).exists()).toBe(false)
    expect(updateClientProfile).not.toHaveBeenCalled()
  })
  it('requests a new-email verification and does not mutate the old email', async () => {
    const wrapper = render()
    await flushPromises()
    await choose(wrapper, 'security')
    await button(wrapper, 'Cambiar correo').trigger('click')
    expect(wrapper.getComponent(ClientEmailChangeDialog).props('open')).toBe(true)
    wrapper.getComponent(ClientEmailChangeDialog).vm.$emit('request', 'new@example.com')
    await flushPromises()
    expect(requestClientEmailChange).toHaveBeenCalledWith('new@example.com')
    expect(wrapper.getComponent(ClientEmailChangeDialog).props('open')).toBe(false)
    expect(wrapper.text()).toContain('30 minutos')
    expect(clientSession.user.value?.email).toBe(data.email)
  })
  it('retains the email dialog and reports a failed send', async () => {
    vi.mocked(requestClientEmailChange).mockRejectedValue(new Error('smtp failed'))
    const wrapper = render()
    await flushPromises()
    await choose(wrapper, 'security')
    await button(wrapper, 'Cambiar correo').trigger('click')
    wrapper.getComponent(ClientEmailChangeDialog).vm.$emit('request', 'new@example.com')
    await flushPromises()
    expect(wrapper.getComponent(ClientEmailChangeDialog).props('error')).toContain(
      'Tu correo actual se mantiene',
    )
    wrapper.getComponent(ClientEmailChangeDialog).vm.$emit('close')
    await flushPromises()
    expect(wrapper.getComponent(ClientEmailChangeDialog).props('open')).toBe(false)
    wrapper.getComponent(NotificationPopup).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
  })
  it('reuses the password component and locks navigation during its submission', async () => {
    const wrapper = render()
    await flushPromises()
    await choose(wrapper, 'security')
    const password = wrapper.getComponent(ChangePasswordView)
    expect(password.props('embedded')).toBe(true)
    expect(password.props('accountType')).toBe('client')
    password.vm.$emit('submission-state', true)
    expect(navigation.leave?.()).toBe(false)
    await choose(wrapper, 'preferences')
    expect(wrapper.findComponent(ChangePasswordView).exists()).toBe(true)
    password.vm.$emit('submission-state', false)
    password.vm.$emit('return-to-profile')
    await flushPromises()
    expect(wrapper.text()).toContain('Mis datos')
  })
  it('requires confirmation before self deactivation and allows cancelling', async () => {
    const wrapper = render()
    await flushPromises()
    await choose(wrapper, 'deactivation')
    await button(wrapper, 'Desactivar mi cuenta').trigger('click')
    expect(deactivateClientProfile).not.toHaveBeenCalled()
    const dialog = confirmation(wrapper, '¿Desactivar tu cuenta?')
    expect(dialog.props('open')).toBe(true)
    dialog.vm.$emit('cancel')
    await flushPromises()
    expect(dialog.props('open')).toBe(false)
    await button(wrapper, 'Desactivar mi cuenta').trigger('click')
    dialog.vm.$emit('confirm')
    await flushPromises()
    expect(deactivateClientProfile).toHaveBeenCalledTimes(1)
    expect(clientSession.user.value).toBeNull()
    expect(wrapper.text()).toContain('Cuenta desactivada')
  })
  it('shows a deactivation failure while retaining the session', async () => {
    vi.mocked(deactivateClientProfile).mockRejectedValue(new Error('offline'))
    const wrapper = render()
    await flushPromises()
    await choose(wrapper, 'deactivation')
    confirmation(wrapper, '¿Desactivar tu cuenta?').vm.$emit('confirm')
    await flushPromises()
    expect(wrapper.text()).toContain('No se pudo desactivar tu cuenta')
    expect(clientSession.user.value?.id).toBe(7)
  })
  it('ignores late profile responses after a new session takes over', async () => {
    let resolve!: (profile: ClientProfile) => void
    vi.mocked(getClientProfile).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const wrapper = render()
    establishClientSession(
      { id: 8, email: 'other@example.com', firstName: 'Otra', lastName: '' },
      'other-token',
    )
    resolve(data)
    await flushPromises()
    expect(clientSession.user.value?.id).toBe(8)
    expect(wrapper.text()).not.toContain('Ana María Rojas')
  })
  it('blocks repeated saves and ignores an old mutation response after logout', async () => {
    let resolve!: () => void
    vi.mocked(updateClientProfile).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const wrapper = render()
    await edit(wrapper)
    const form = wrapper.getComponent(ClientProfileForm)
    form.vm.$emit('save', { firstName: 'María' })
    form.vm.$emit('save', { firstName: 'María' })
    expect(updateClientProfile).toHaveBeenCalledTimes(1)
    clearClientSession()
    resolve()
    await flushPromises()
    expect(getClientProfile).toHaveBeenCalledTimes(1)
    expect(clientSession.user.value).toBeNull()
  })
  it('redirects after an expired-session write instead of the busy guard blocking login', async () => {
    const wrapper = render()
    await edit(wrapper)
    wrapper.getComponent(ClientProfileForm).vm.$emit('dirty', true)
    vi.mocked(updateClientProfile).mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    })
    wrapper.getComponent(ClientProfileForm).vm.$emit('save', { firstName: 'María' })
    await flushPromises()
    expect(navigation.replace).toHaveBeenCalledWith({
      path: '/',
      query: { login: 'client', reason: 'expired' },
    })
    expect(navigation.leave?.()).toBe(true)
    expect(clientSession.user.value).toBeNull()
  })
})
