import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'
import { EmailDeliveryError, registerUser, resendEmailVerification } from '@/services/authService'

const { mockedEmailDeliveryError } = vi.hoisted(() => ({
  mockedEmailDeliveryError: class EmailDeliveryError extends Error {},
}))
vi.mock('@/services/authService', () => ({
  EmailDeliveryError: mockedEmailDeliveryError,
  registerUser: vi.fn(),
  resendEmailVerification: vi.fn(),
}))

describe('RegisterModal.vue', () => {
  let realWrapper: VueWrapper | undefined
  const prototype = HTMLDialogElement.prototype
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  afterEach(() => {
    realWrapper?.unmount()
    realWrapper = undefined
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
  })

  it('preserves registration validation and events inside the real native modal', async () => {
    realWrapper = mount(RegisterModal, {
      props: { open: true },
      attachTo: document.body,
    })
    const page = new DOMWrapper(document.body)
    await nextTick()
    expect(page.get('dialog').element.open).toBe(true)
    expect(document.activeElement).toBe(page.get('#email').element)
    await page.get('form').trigger('submit')
    expect(page.text()).toContain('Ingresa un correo válido')
    expect(registerUser).not.toHaveBeenCalled()
    await page.get('.app-modal-close').trigger('click')
    expect(realWrapper.emitted('close')).toHaveLength(1)
    await realWrapper.setProps({ open: false })
    expect(page.get('dialog').element.open).toBe(false)
    expect(document.body.style.position).toBe('')
  })

  const createWrapper = (props = { open: true }) => {
    return mount(RegisterModal, {
      props,
      global: {
        stubs: {
          BaseModal: {
            props: ['open', 'title'],
            emits: ['close'],
            template:
              '<div v-if="open"><slot /><button id="btn-close-modal" @click="$emit(\'close\')"></button></div>',
          },
          SocialAuthButtons: true,
        },
      },
    })
  }

  it('shows independent controls to reveal and hide both password fields', async () => {
    const wrapper = createWrapper()
    const password = wrapper.get('#password')
    const confirmation = wrapper.get('#confirmPassword')
    const passwordToggle = wrapper.get('button[aria-controls="password"]')
    const confirmationToggle = wrapper.get('button[aria-controls="confirmPassword"]')

    expect(password.attributes('type')).toBe('password')
    expect(confirmation.attributes('type')).toBe('password')

    await passwordToggle.trigger('click')
    expect(password.attributes('type')).toBe('text')
    expect(confirmation.attributes('type')).toBe('password')
    expect(passwordToggle.attributes('aria-label')).toBe('Ocultar contraseña')

    await confirmationToggle.trigger('click')
    expect(confirmation.attributes('type')).toBe('text')

    await wrapper.setProps({ open: false })
    expect(wrapper.find('#password').exists()).toBe(false)
    await wrapper.setProps({ open: true })
    expect(wrapper.get('#password').attributes('type')).toBe('password')
    expect(wrapper.get('#confirmPassword').attributes('type')).toBe('password')
  })

  function dateOneDayBeforeTurningEighteen(): string {
    const today = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Costa_Rica',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts()
        .map(({ type, value }) => [type, value]),
    )
    const date = new Date(
      Date.UTC(Number(today.year) - 18, Number(today.month) - 1, Number(today.day) + 1),
    )
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-')
  }

  it('rejects telephone numbers that are not eight Costa Rican digits', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#phone').setValue('1234567')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Ingresa un teléfono costarricense válido de 8 dígitos')
    expect(registerUser).not.toHaveBeenCalled()
  })

  it('blocks registration for a user who has not turned 18', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#birthDate').setValue(dateOneDayBeforeTurningEighteen())
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Debes tener al menos 18 años para registrarte')
    expect(registerUser).not.toHaveBeenCalled()
  })

  it('no envía el formulario si los campos obligatorios están vacíos', async () => {
    const wrapper = createWrapper()
    await wrapper.find('form').trigger('submit.prevent')

    expect(registerUser).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ingresa un correo válido')
    expect(wrapper.text()).toContain('Requerido')
    expect(wrapper.text()).toContain('Debes aceptar los términos')
  })
  it('accepts a landline while rejecting names exceeding the database byte limit', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#phone').setValue('22222222')
    await wrapper.find('#firstName').setValue('é'.repeat(51))
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.get('#phone').classes()).not.toContain('is-invalid')
    expect(wrapper.text()).toContain('100 bytes')
    expect(registerUser).not.toHaveBeenCalled()
  })

  it('valida formato de contraseña insegura', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#password').setValue('simple')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain(
      'Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial',
    )
  })

  it('valida que la contraseña no sea igual al email o nombres', async () => {
    const wrapper = createWrapper()
    const password = 'Password123!'
    await wrapper.find('#email').setValue(password)
    await wrapper.find('#password').setValue(password)
    await wrapper.find('#confirmPassword').setValue(password)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain(
      'La contraseña no puede ser igual al correo ni al nombre de usuario',
    )
  })

  it('valida que las contraseñas coincidan', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#password').setValue('Password123!')
    await wrapper.find('#confirmPassword').setValue('Different123!')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Las contraseñas no coinciden')
  })

  it('keeps the registration dialog open and asks the user to confirm email', async () => {
    vi.mocked(registerUser).mockResolvedValueOnce(
      {} as unknown as Awaited<ReturnType<typeof registerUser>>,
    )
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('juan.perez@example.com')
    await wrapper.find('#firstName').setValue('Juan')
    await wrapper.find('#lastName').setValue('Perez')
    await wrapper.find('#phone').setValue('8888-1234')
    await wrapper.find('#gender').setValue('M')
    await wrapper.find('#birthDate').setValue('1990-01-01')
    await wrapper.find('#password').setValue('Password123!')
    await wrapper.find('#confirmPassword').setValue('Password123!')
    await wrapper.find('#terms').setValue(true)

    await wrapper.find('form').trigger('submit.prevent')

    expect(registerUser).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '88881234',
      }),
    )
    expect(registerUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmPassword: 'Password123!' }),
    )
    expect(wrapper.text()).toContain('Te enviamos un enlace de confirmación')
    expect(wrapper.text()).toContain('juan.perez@example.com')
    expect(wrapper.get('button[type="button"]').text()).toContain('Reenviar correo')
    expect(wrapper.emitted('authenticated')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('offers resend after delivery failure and reports a successful retry', async () => {
    vi.mocked(registerUser).mockRejectedValueOnce(
      new EmailDeliveryError('No se pudo enviar el correo'),
    )
    vi.mocked(resendEmailVerification).mockResolvedValueOnce(undefined)
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('ana@example.com')
    await wrapper.find('#firstName').setValue('Ana')
    await wrapper.find('#lastName').setValue('Perez')
    await wrapper.find('#phone').setValue('8888-1234')
    await wrapper.find('#gender').setValue('F')
    await wrapper.find('#birthDate').setValue('1990-01-01')
    await wrapper.find('#password').setValue('Password123!')
    await wrapper.find('#confirmPassword').setValue('Password123!')
    await wrapper.find('#terms').setValue(true)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('La cuenta quedó pendiente')
    await wrapper.get('button[type="button"]').trigger('click')
    expect(resendEmailVerification).toHaveBeenCalledExactlyOnceWith('ana@example.com')
    expect(wrapper.text()).toContain('Te enviamos un enlace de confirmación')
  })

  it('forwards the authenticated Google identity through the registration event', async () => {
    const identity = {
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Perez',
    }
    const wrapper = createWrapper()

    wrapper.getComponent(SocialAuthButtons).vm.$emit('authenticated', identity)
    await nextTick()

    expect(wrapper.emitted('authenticated')).toEqual([[identity]])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('muestra mensaje de error si el servicio lanza una instancia de Error', async () => {
    vi.mocked(registerUser).mockRejectedValueOnce(new Error('El correo ya está registrado'))
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#firstName').setValue('Test')
    await wrapper.find('#lastName').setValue('User')
    await wrapper.find('#phone').setValue('8888-1234')
    await wrapper.find('#gender').setValue('F')
    await wrapper.find('#birthDate').setValue('1995-05-05')
    await wrapper.find('#password').setValue('ValidPass1!')
    await wrapper.find('#confirmPassword').setValue('ValidPass1!')
    await wrapper.find('#terms').setValue(true)

    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('El correo ya está registrado')
  })

  it('muestra error inesperado si la excepción no es Error', async () => {
    vi.mocked(registerUser).mockRejectedValueOnce('Error de red plano')
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#firstName').setValue('Test')
    await wrapper.find('#lastName').setValue('User')
    await wrapper.find('#phone').setValue('8888-1234')
    await wrapper.find('#gender').setValue('F')
    await wrapper.find('#birthDate').setValue('1995-05-05')
    await wrapper.find('#password').setValue('ValidPass1!')
    await wrapper.find('#confirmPassword').setValue('ValidPass1!')
    await wrapper.find('#terms').setValue(true)

    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Error inesperado')
  })

  it('reenvía el evento close emitido por BaseModal', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#btn-close-modal').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
