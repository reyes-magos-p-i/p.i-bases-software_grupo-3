import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import {
  changeClientPassword,
  changeEmployeePassword,
  getClientPasswordStatus,
  getEmployeePasswordStatus,
  ChangePasswordError,
  validatePasswordRecovery,
  resetPassword,
} from '@/services/authService'
import { clientSession } from '@/services/client-session.service'
import { employeeSession } from '@/services/employee-session.service'

vi.mock('@/services/authService', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/authService')>('@/services/authService')
  return {
    ...actual,
    changeClientPassword: vi.fn(),
    changeEmployeePassword: vi.fn(),
    getClientPasswordStatus: vi.fn(),
    getEmployeePasswordStatus: vi.fn(),
    validatePasswordRecovery: vi.fn(),
    resetPassword: vi.fn(),
  }
})
vi.mock('@/services/employee-session.service', async () => {
  const { ref } = await import('vue')
  return { employeeSession: { user: ref(null) } }
})

const mockPush = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockPush }) }))

describe('ChangePasswordView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(validatePasswordRecovery)
      .mockReset()
      .mockResolvedValue({ accountType: 'client', expiresAt: '2030-01-01T12:00:00Z' })
    vi.mocked(resetPassword).mockReset().mockResolvedValue({ message: 'Actualizada' })
    vi.mocked(getEmployeePasswordStatus).mockResolvedValue('valid')
    clientSession.user.value = {
      id: 1,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Perez',
    }
    Object.assign(employeeSession.user, {
      value: {
        id: 21,
        email: 'ana@example.com',
        firstName: 'Ana',
        role: 'ADMINISTRATOR',
      },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function mountView(
    props: {
      embedded?: boolean
      accountType?: 'client' | 'employee'
      recovery?: boolean
      recoveryToken?: string
    } = {},
  ) {
    return mount(ChangePasswordView, {
      props,
      global: {
        stubs: {
          AppHeader: { template: '<header data-testid="landing-header"></header>' },
          AppFooter: { template: '<footer data-testid="landing-footer"></footer>' },
        },
      },
    })
  }

  it.each(['client', 'employee'] as const)(
    'recovers %s through the shared form and returns to the matching login',
    async (accountType) => {
      vi.mocked(validatePasswordRecovery).mockResolvedValue({
        accountType,
        expiresAt: '2030-01-01T12:00:00Z',
      })
      const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
      await flushPromises()
      expect(validatePasswordRecovery).toHaveBeenCalledWith('a'.repeat(64))
      expect(getClientPasswordStatus).not.toHaveBeenCalled()
      expect(getEmployeePasswordStatus).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Contraseña temporal')
      expect(wrapper.text()).toContain('solo puede usarse una vez')
      await wrapper.get('#currentPassword').setValue('temporary')
      await wrapper.get('#newPassword').setValue('NewSecret123!')
      await wrapper.get('#confirmNewPassword').setValue('NewSecret123!')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(resetPassword).toHaveBeenCalledWith({
        token: 'a'.repeat(64),
        temporaryPassword: 'temporary',
        newPassword: 'NewSecret123!',
        confirmNewPassword: 'NewSecret123!',
        expirationDays: 90,
      })
      expect(changeClientPassword).not.toHaveBeenCalled()
      expect(changeEmployeePassword).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Contraseña actualizada')
      await wrapper.get('.continue-button').trigger('click')
      expect(mockPush).toHaveBeenCalledWith({ path: '/', query: { login: accountType } })
      wrapper.unmount()
    },
  )

  it('rejects missing or malformed links without calling the API', async () => {
    const wrapper = mountView({ recovery: true, recoveryToken: 'invalid' })
    await flushPromises()
    expect(validatePasswordRecovery).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('El enlace no es válido')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Volver al inicio de sesión')
    wrapper.unmount()
  })

  it('offers a new recovery for expired links', async () => {
    vi.mocked(validatePasswordRecovery).mockRejectedValue(
      new ChangePasswordError('El enlace venció', 'RECOVERY_INVALID'),
    )
    const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
    await flushPromises()
    expect(wrapper.text()).toContain('El enlace venció')
    expect(wrapper.text()).not.toContain('Reintentar')
    await wrapper.get('.secondary-button').trigger('click')
    expect(mockPush).toHaveBeenCalledWith({ path: '/', query: { login: 'client' } })
    wrapper.unmount()
  })

  it('allows retrying link validation after a network failure', async () => {
    vi.mocked(validatePasswordRecovery).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
    await flushPromises()
    expect(wrapper.text()).toContain('Reintentar')
    await wrapper.get('.primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(validatePasswordRecovery).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('requires the temporary password and matching new passwords before submitting', async () => {
    const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Ingresa la contraseña temporal del correo')
    await wrapper.get('#currentPassword').setValue('temporary')
    await wrapper.get('#newPassword').setValue('NewSecret123!')
    await wrapper.get('#confirmNewPassword').setValue('OtherSecret123!')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Las contraseñas no coinciden')
    expect(resetPassword).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each(['TEMPORARY_PASSWORD_INCORRECT', 'RECOVERY_INVALID', 'PASSWORD_POLICY_VIOLATION'])(
    'displays recovery rejection %s without claiming success',
    async (code) => {
      vi.mocked(resetPassword).mockRejectedValue(
        new ChangePasswordError('Solicitud rechazada', code, ['matches_identity']),
      )
      const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
      await flushPromises()
      await wrapper.get('#currentPassword').setValue('temporary')
      await wrapper.get('#newPassword').setValue('NewSecret123!')
      await wrapper.get('#confirmNewPassword').setValue('NewSecret123!')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('.success-state').exists()).toBe(false)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      if (code === 'RECOVERY_INVALID') expect(wrapper.find('form').exists()).toBe(false)
      else expect(wrapper.find('form').exists()).toBe(true)
      wrapper.unmount()
    },
  )

  it('blocks repeated reset requests during the retry delay', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const error = new ChangePasswordError('Espera', 'RECOVERY_THROTTLED')
    error.retryAfterSeconds = 2
    vi.mocked(resetPassword).mockRejectedValue(error)
    const wrapper = mountView({ recovery: true, recoveryToken: 'a'.repeat(64) })
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('temporary')
    await wrapper.get('#newPassword').setValue('NewSecret123!')
    await wrapper.get('#confirmNewPassword').setValue('NewSecret123!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    expect(resetPassword).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('2 segundos')
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.get<HTMLButtonElement>('[type="submit"]').element.disabled).toBe(false)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

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

  it('loads the employee password status and offers the expired-password recovery form', async () => {
    vi.mocked(getEmployeePasswordStatus).mockResolvedValueOnce('expired')
    const wrapper = mountView({ accountType: 'employee', embedded: true })
    await flushPromises()

    expect(getEmployeePasswordStatus).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Tu contraseña venció.')
    expect(wrapper.find('#currentPassword').exists()).toBe(true)
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

  it('emits the submission state while an employee password change is pending', async () => {
    let resolveChange!: () => void
    vi.mocked(changeEmployeePassword).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveChange = resolve
      }),
    )
    const wrapper = mountView({ accountType: 'employee', embedded: true })
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('CurrentPassword-123!')
    await wrapper.get('#newPassword').setValue('Secure-Password-784!')
    await wrapper.get('#confirmNewPassword').setValue('Secure-Password-784!')

    const submission = wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('submission-state')).toEqual([[true]])

    resolveChange()
    await submission
    await flushPromises()
    expect(wrapper.emitted('submission-state')).toEqual([[true], [false]])
  })

  it('shows the four distinct backend error codes', async () => {
    vi.mocked(getClientPasswordStatus).mockResolvedValueOnce('valid')
    vi.mocked(changeClientPassword).mockRejectedValueOnce(
      new ChangePasswordError(
        'La nueva contraseña no puede ser igual a la actual.',
        'NEW_PASSWORD_SAME_AS_CURRENT',
      ),
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
      new ChangePasswordError(
        message,
        code,
        code === 'PASSWORD_POLICY_VIOLATION' ? ['min_length'] : undefined,
      ),
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

  it('embeds for administrators, skips client status, and keeps the policy checks live', async () => {
    const wrapper = mountView({ embedded: true, accountType: 'employee' })
    await flushPromises()

    expect(wrapper.find('[data-testid="landing-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="landing-footer"]').exists()).toBe(false)
    expect(wrapper.find('#currentPassword').exists()).toBe(true)
    expect(getClientPasswordStatus).not.toHaveBeenCalled()

    await wrapper.get('#newPassword').setValue('weak')
    expect(wrapper.findAll('.policy-checklist li.satisfied').length).toBeLessThan(7)
    await wrapper.get('#confirmNewPassword').setValue('weak')
    await wrapper.get('#currentPassword').setValue('Current!Password9')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('La contraseña no cumple con la política de seguridad')
    expect(changeEmployeePassword).not.toHaveBeenCalled()
  })

  it('updates an employee password with the selected expiration and returns to the dashboard', async () => {
    vi.mocked(changeEmployeePassword).mockResolvedValueOnce(undefined)
    const wrapper = mountView({ embedded: true, accountType: 'employee' })
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('Current!Password9')
    await wrapper.get('#newPassword').setValue('Cr0wn!River77')
    await wrapper.get('#confirmNewPassword').setValue('Cr0wn!River77')
    await wrapper.get('#expirationDays').setValue('60')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changeEmployeePassword).toHaveBeenCalledWith({
      currentPassword: 'Current!Password9',
      newPassword: 'Cr0wn!River77',
      confirmNewPassword: 'Cr0wn!River77',
      expirationDays: 60,
    })
    expect(wrapper.text()).toContain('Contraseña actualizada correctamente')
    await wrapper.get('.continue-button').trigger('click')
    expect(wrapper.emitted('return-to-dashboard')).toHaveLength(1)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows employee-specific errors and preserves the active session on backend failure', async () => {
    vi.mocked(changeEmployeePassword).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView({ embedded: true, accountType: 'employee' })
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('Current!Password9')
    await wrapper.get('#newPassword').setValue('Cr0wn!River77')
    await wrapper.get('#confirmNewPassword').setValue('Cr0wn!River77')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('No se pudo actualizar la contraseña, intenta de nuevo')
    expect(employeeSession.user.value?.id).toBe(21)
    expect(wrapper.find('.success-state').exists()).toBe(false)
  })

  it('shows the specified incorrect-current-password message for an administrator', async () => {
    vi.mocked(changeEmployeePassword).mockRejectedValueOnce(
      new ChangePasswordError('La contraseña actual no es correcta.', 'CURRENT_PASSWORD_INCORRECT'),
    )
    const wrapper = mountView({ embedded: true, accountType: 'employee' })
    await flushPromises()
    await wrapper.get('#currentPassword').setValue('Wrong!Password9')
    await wrapper.get('#newPassword').setValue('Cr0wn!River77')
    await wrapper.get('#confirmNewPassword').setValue('Cr0wn!River77')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Contraseña actual incorrecta')
    expect(wrapper.find('.success-state').exists()).toBe(false)
  })
})

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve))
}
