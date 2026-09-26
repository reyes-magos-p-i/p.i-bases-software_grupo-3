import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import { registerUser } from '@/services/authService'

vi.mock('@/services/authService', () => ({
  registerUser: vi.fn(),
}))

describe('RegisterModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createWrapper = (props = { open: true }) => {
    return mount(RegisterModal, {
      props,
      global: {
        stubs: {
          BaseModal: {
            props: ['open', 'title'],
            emits: ['close'],
            template: '<div v-if="open"><slot /><button id="btn-close-modal" @click="$emit(\'close\')"></button></div>',
          },
          SocialAuthButtons: true,
        },
      },
    })
  }

  it('no envía el formulario si los campos obligatorios están vacíos', async () => {
    const wrapper = createWrapper()
    await wrapper.find('form').trigger('submit.prevent')

    expect(registerUser).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ingresa un correo válido')
    expect(wrapper.text()).toContain('Requerido')
    expect(wrapper.text()).toContain('Debes aceptar los términos')
  })

  it('valida formato de contraseña insegura', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#password').setValue('simple')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial')
  })

  it('valida que la contraseña no sea igual al email o nombres', async () => {
    const wrapper = createWrapper()
    const password = 'Password123!'
    await wrapper.find('#email').setValue(password)
    await wrapper.find('#password').setValue(password)
    await wrapper.find('#confirmPassword').setValue(password)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('La contraseña no puede ser igual al correo ni al nombre de usuario')
  })

  it('valida que las contraseñas coincidan', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#password').setValue('Password123!')
    await wrapper.find('#confirmPassword').setValue('Different123!')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Las contraseñas no coinciden')
  })

  it('ejecuta registro con éxito y emite eventos', async () => {

    vi.mocked(registerUser).mockResolvedValueOnce({} as unknown as Awaited<ReturnType<typeof registerUser>>)
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('juan.perez@example.com')
    await wrapper.find('#firstName').setValue('Juan')
    await wrapper.find('#lastName').setValue('Perez')
    await wrapper.find('#phone').setValue('1234567890')
    await wrapper.find('#gender').setValue('M')
    await wrapper.find('#birthDate').setValue('1990-01-01')
    await wrapper.find('#password').setValue('Password123!')
    await wrapper.find('#confirmPassword').setValue('Password123!')
    await wrapper.find('#terms').setValue(true)

    await wrapper.find('form').trigger('submit.prevent')

    expect(registerUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmPassword: 'Password123!' })
    )
    expect(wrapper.emitted('registered')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('muestra mensaje de error si el servicio lanza una instancia de Error', async () => {
    vi.mocked(registerUser).mockRejectedValueOnce(new Error('El correo ya está registrado'))
    const wrapper = createWrapper()

    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#firstName').setValue('Test')
    await wrapper.find('#lastName').setValue('User')
    await wrapper.find('#phone').setValue('1234567890')
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
    await wrapper.find('#phone').setValue('1234567890')
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