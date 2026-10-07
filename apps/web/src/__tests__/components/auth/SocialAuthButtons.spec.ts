import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'

const { loginWithGoogle, facebookLogin, loginWithFacebook } = vi.hoisted(() => ({
  loginWithGoogle: vi.fn().mockResolvedValue({
    id: 7,
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'Perez',
  }),
  facebookLogin: vi.fn().mockResolvedValue({
    client: { id: 8, email: 'luis@example.com', firstName: 'Luis', lastName: 'Mora' },
  }),
  loginWithFacebook: vi.fn().mockResolvedValue({
    status: 'connected',
    authResponse: { accessToken: 'test-access-token' },
  }),
}))

vi.mock('@/services/authService', () => ({ loginWithGoogle, facebookLogin }))
vi.mock('@/facebook-auth', () => ({ loginWithFacebook }))

describe('SocialAuthButtons.vue', () => {
  it('preserves registration labels by default', () => {
    const wrapper = mount(SocialAuthButtons)
    expect(wrapper.text()).toContain('Registrarse con Google')
    expect(wrapper.text()).toContain('Registrarse con Facebook')
  })

  it('renders unavailable login providers without emitting events', async () => {
    const wrapper = mount(SocialAuthButtons, { props: { mode: 'login', disabled: true } })
    expect(wrapper.text()).toContain('Iniciar sesión con Google')
    expect(wrapper.text()).toContain('Iniciar sesión con Facebook')
    for (const button of wrapper.findAll('button')) {
      expect(button.element.disabled).toBe(true)
      await button.trigger('click')
    }
    expect(wrapper.emitted('authenticated')).toBeUndefined()
  })
  it('emits the authenticated Google identity', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[0]!.trigger('click')

    expect(loginWithGoogle).toHaveBeenCalledOnce()
    expect(wrapper.emitted('authenticated')).toEqual([
      [{ id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Perez' }],
    ])
  })

  it('verifies Facebook with the API and emits the authenticated profile', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[1]!.trigger('click')

    expect(facebookLogin).toHaveBeenCalledExactlyOnceWith('test-access-token')
    expect(wrapper.emitted('authenticated')).toEqual([
      [{ id: 8, email: 'luis@example.com', firstName: 'Luis', lastName: 'Mora' }],
    ])
  })

  it('emits a general error when Facebook does not connect', async () => {
    loginWithFacebook.mockResolvedValueOnce({ status: 'unknown' })
    const wrapper = mount(SocialAuthButtons)

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('error')).toEqual([
      ['No se pudo conectar con Facebook. Inténtalo nuevamente.'],
    ])
  })
})
