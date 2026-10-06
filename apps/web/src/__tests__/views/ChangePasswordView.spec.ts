import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import { changeClientPassword, getClientPasswordStatus, ChangePasswordError } from '@/services/authService'
import { clientSession } from '@/services/client-session.service'

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<typeof import('@/services/authService')>('@/services/authService')
  return { ...actual, changeClientPassword: vi.fn(), getClientPasswordStatus: vi.fn() }
})

const mockPush = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockPush }) }))

describe('ChangePasswordView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientSession.user.value = { id: 1, email: 'ana@example.com', firstName: 'Ana', lastName: 'Perez' }
  })

  it('shows the must_set copy and hides the current-password field', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('must_set')
    const wrapper = mount(ChangePasswordView)
    await flushPromises()
    expect(wrapper.text()).toContain('Configura tu contraseña')
    expect(wrapper.find('#currentPassword').exists()).toBe(false)
  })

  it('shows the expired banner and hides the cancel button', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('expired')
    const wrapper = mount(ChangePasswordView)
    await flushPromises()
    expect(wrapper.text()).toContain('Tu contraseña expiró')
    expect(wrapper.find('button.secondary').exists()).toBe(false)
  })

  it('requires the current password in voluntary mode', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    const wrapper = mount(ChangePasswordView)
    await flushPromises()
    await wrapper.find('#newPassword').setValue('Password123!')
    await wrapper.find('#confirmNewPassword').setValue('Password123!')
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.text()).toContain('Ingresa tu contraseña actual')
    expect(changeClientPassword).not.toHaveBeenCalled()
  })

  it('shows the four distinct backend error codes', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockRejectedValueOnce(
      new ChangePasswordError('La nueva contraseña no puede ser igual a la actual.', 'NEW_PASSWORD_SAME_AS_CURRENT'),
    )
    const wrapper = mount(ChangePasswordView)
    await flushPromises()
    await wrapper.find('#currentPassword').setValue('Old123!')
    await wrapper.find('#newPassword').setValue('Old123!')
    await wrapper.find('#confirmNewPassword').setValue('Old123!')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('La nueva contraseña no puede ser igual a la actual.')
  })

  it('shows success and navigates home on continue', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockResolvedValueOnce(undefined)
    const wrapper = mount(ChangePasswordView)
    await flushPromises()
    await wrapper.find('#currentPassword').setValue('Old123!')
    await wrapper.find('#newPassword').setValue('Password123!')
    await wrapper.find('#confirmNewPassword').setValue('Password123!')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('Tu contraseña se actualizó correctamente.')
    await wrapper.find('button').trigger('click')
  })
})

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve))
}