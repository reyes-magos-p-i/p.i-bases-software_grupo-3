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

  function mountView() {
    return mount(ChangePasswordView, {
      global: {
        stubs: {
          AppHeader: { template: '<header data-testid="landing-header"></header>' },
          AppFooter: { template: '<footer data-testid="landing-footer"></footer>' },
        },
      },
    })
  }

  it('keeps the landing header and footer and lays out the form beside the policy card', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="landing-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="landing-footer"]').exists()).toBe(true)
    expect(wrapper.find('.password-layout .form-card').exists()).toBe(true)
    expect(wrapper.find('.password-layout .policy-card').exists()).toBe(true)
    expect(wrapper.find('#currentPassword').exists()).toBe(true)
    expect(wrapper.find('#newPassword').exists()).toBe(true)
    expect(wrapper.find('#confirmNewPassword').exists()).toBe(true)
    expect(wrapper.find('#expirationDays').exists()).toBe(true)
    expect(wrapper.text()).toContain('Contraseña segura')
  })

  it('shows the must_set copy and hides the current-password field', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('must_set')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Configura tu contraseña')
    expect(wrapper.find('#currentPassword').exists()).toBe(false)
  })

  it('retries loading the password status after a failure', async () => {
    vi.mocked(getClientPasswordStatus)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('valid')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No se pudo comprobar el estado de tu contraseña.')
    await wrapper.get('.form-card .primary-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.status-error').exists()).toBe(false)
    expect(wrapper.find('#currentPassword').exists()).toBe(true)
  })

  it('shows the expired banner and hides the cancel button', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('expired')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Tu contraseña venció.')
    expect(wrapper.find('button.secondary').exists()).toBe(false)
  })

  it('requires the current password in voluntary mode', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('#newPassword').setValue('Password123!')
    await wrapper.find('#confirmNewPassword').setValue('Password123!')
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.text()).toContain('Ingresa tu contraseña actual')
    expect(changeClientPassword).not.toHaveBeenCalled()
  })

  it('validates matching confirmation and password policy before submitting', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('OldPassword1!')
    await wrapper.get('#newPassword').setValue('NotSecure')
    await wrapper.get('#confirmNewPassword').setValue('Different')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Las contraseñas no coinciden')
    expect(changeClientPassword).not.toHaveBeenCalled()

    await wrapper.get('#confirmNewPassword').setValue('NotSecure')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('La contraseña no cumple con la política de seguridad')
    expect(changeClientPassword).not.toHaveBeenCalled()
  })

  it('lets users reveal and hide each password field', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    const wrapper = mountView()
    await flushPromises()

    for (const id of ['currentPassword', 'newPassword', 'confirmNewPassword']) {
      const toggle = wrapper.get(`[aria-controls="${id}"]`)
      await toggle.trigger('click')
      expect(wrapper.get(`#${id}`).attributes('type')).toBe('text')
      await toggle.trigger('click')
      expect(wrapper.get(`#${id}`).attributes('type')).toBe('password')
    }
  })

  it('submits a valid password without a current password when setup is required', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('must_set')
    vi.mocked(changeClientPassword).mockResolvedValueOnce(undefined)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#newPassword').setValue('Secure-Password-784!')
    await wrapper.get('#confirmNewPassword').setValue('Secure-Password-784!')
    await wrapper.get('#expirationDays').setValue('120')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changeClientPassword).toHaveBeenCalledWith({
      newPassword: 'Secure-Password-784!',
      confirmNewPassword: 'Secure-Password-784!',
      expirationDays: 120,
    })
    expect(wrapper.text()).toContain('Tu contraseña se actualizó correctamente.')
  })

  it('shows the four distinct backend error codes', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockRejectedValueOnce(
      new ChangePasswordError('La nueva contraseña no puede ser igual a la actual.', 'NEW_PASSWORD_SAME_AS_CURRENT'),
    )
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('#currentPassword').setValue('OldPassword1!')
    await wrapper.find('#newPassword').setValue('OldPassword1!')
    await wrapper.find('#confirmNewPassword').setValue('OldPassword1!')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('La nueva contraseña no puede ser igual a la actual.')
  })

  it.each([
    ['CURRENT_PASSWORD_INCORRECT', 'La contraseña actual no es correcta.'],
    ['PASSWORDS_DO_NOT_MATCH', 'Las contraseñas no coinciden.'],
    ['PASSWORD_POLICY_VIOLATION', 'La contraseña no cumple con la política de seguridad.'],
  ])('displays the %s backend error', async (code, message) => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockRejectedValueOnce(
      new ChangePasswordError(message, code, code === 'PASSWORD_POLICY_VIOLATION' ? ['min_length'] : undefined),
    )
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('OldPassword1!')
    await wrapper.get('#newPassword').setValue('Secure-Password-784!')
    await wrapper.get('#confirmNewPassword').setValue('Secure-Password-784!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain(message)
    if (code === 'PASSWORD_POLICY_VIOLATION') {
      expect(wrapper.find('.policy-checklist li.violated').exists()).toBe(true)
    }
  })

  it('displays a generic error when password update fails unexpectedly', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('OldPassword1!')
    await wrapper.get('#newPassword').setValue('Secure-Password-784!')
    await wrapper.get('#confirmNewPassword').setValue('Secure-Password-784!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('No se pudo actualizar la contraseña, intenta de nuevo.')
  })

  it('shows success and navigates home on continue', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockResolvedValueOnce(undefined)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('#currentPassword').setValue('Old123!')
    await wrapper.find('#newPassword').setValue('Password123!')
    await wrapper.find('#confirmNewPassword').setValue('Password123!')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.text()).toContain('Tu contraseña se actualizó correctamente.')
    await wrapper.find('.continue-button').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve))
}