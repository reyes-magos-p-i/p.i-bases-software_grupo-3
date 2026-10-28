import DatePicker from '@/components/common/DatePicker.vue'
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
    realWrapper = mount(RegisterModal, {
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
    return realWrapper
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

    expect(wrapper.text()).toContain(
      'Ingresa un celular de Costa Rica de ocho dígitos que comience con 6, 7 u 8.',
    )
    expect(registerUser).not.toHaveBeenCalled()
  })

  it('blocks registration for a user who has not turned 18', async () => {
    const wrapper = createWrapper()
    await setBirthDate(wrapper, dateOneDayBeforeTurningEighteen())
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Debes tener al menos 18 años para registrarte')
    expect(registerUser).not.toHaveBeenCalled()
  })

  it('no envía el formulario si los campos obligatorios están vacíos', async () => {
    const wrapper = createWrapper()
    await wrapper.find('form').trigger('submit.prevent')

    expect(registerUser).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ingresa un correo válido')
    expect(wrapper.text()).toContain('Ingresa tu nombre.')
    expect(wrapper.text()).toContain('Debes aceptar los términos')
  })
  it('rejects landlines and names exceeding the storage limit', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#phone').setValue('22222222')
    await wrapper.find('#firstName').setValue('é'.repeat(51))
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.get('#phone').classes()).toContain('is-invalid')
    expect(wrapper.text()).toContain('demasiado largo')
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
    const password = 'password123!'
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
    await setBirthDate(wrapper, '1990-01-01')
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
    await setBirthDate(wrapper, '1990-01-01')
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
    await setBirthDate(wrapper, '1995-05-05')
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
    await setBirthDate(wrapper, '1995-05-05')
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
  it('validates a partially written email only on blur, then checks again before submitting', async () => {
    const view = createWrapper()
    const email = view.get('#email')
    await email.setValue('ana@')
    expect(email.classes()).not.toContain('is-invalid')
    await email.trigger('focusout')
    expect(email.classes()).toContain('is-invalid')
    await email.setValue('ana@example..com')
    expect(email.classes()).not.toContain('is-invalid')
    await view.get('form').trigger('submit')
    expect(email.classes()).toContain('is-invalid')
    expect(registerUser).not.toHaveBeenCalled()
  })
  it('rejects invalid names, future birth dates and oversized passwords before making a request', async () => {
    const view = createWrapper()
    await view.get('#firstName').setValue('Ana123')
    await view.get('#firstName').trigger('focusout')
    expect(view.text()).toContain('Usa solo letras y espacios')
    await setBirthDate(view, '2099-01-01')
    await view.get('#password').setValue('Abc1!' + 'a'.repeat(124))
    await view.get('form').trigger('submit')
    expect(view.text()).toContain('fecha de nacimiento válida que no sea futura')
    expect(view.text()).toContain('La contraseña no puede superar 128 caracteres.')
    expect(registerUser).not.toHaveBeenCalled()
    expect(view.text()).not.toMatch(/bytes|UTF-8|Unicode/u)
  })

  it('does not validate registration when closing with the native close button', async () => {
    realWrapper = mount(RegisterModal, {
      props: { open: true },
      attachTo: document.body,
      global: { stubs: { SocialAuthButtons: true } },
    })
    const page = new DOMWrapper(document.body)
    await nextTick()
    const email = page.get<HTMLInputElement>('#email')
    await email.setValue('invalid')
    email.element.focus()
    const close = page.get<HTMLButtonElement>('.app-modal-close')
    close.element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }),
    )
    await email.trigger('focusout', { relatedTarget: null })
    expect(email.classes()).not.toContain('is-invalid')
    await close.trigger('pointerup')
    await close.trigger('click')
    expect(realWrapper.emitted('close')).toHaveLength(1)
    expect(registerUser).not.toHaveBeenCalled()
    await realWrapper.setProps({ open: false })
  })

  it('reveals the password without validating the field being left', async () => {
    const wrapper = createWrapper()
    const password = wrapper.get('#password')
    await password.setValue('unfinished')
    const toggle = wrapper.get('button[aria-controls="password"]')
    await password.trigger('focusout', { relatedTarget: toggle.element })
    expect(password.classes()).not.toContain('is-invalid')
    await toggle.trigger('click')
    expect(password.attributes('type')).toBe('text')
    expect(registerUser).not.toHaveBeenCalled()
    await wrapper.get('form').trigger('submit')
    expect(password.classes()).toContain('is-invalid')
    expect(registerUser).not.toHaveBeenCalled()
  })
})

async function setBirthDate(wrapper: VueWrapper, value: string) {
  wrapper.getComponent(DatePicker).vm.$emit('update:modelValue', value)
  await nextTick()
}
