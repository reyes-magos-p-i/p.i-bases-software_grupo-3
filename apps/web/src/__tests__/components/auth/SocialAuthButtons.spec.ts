import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'

vi.mock('@/facebook-auth', () => ({
  loginWithFacebook: vi.fn().mockResolvedValue({
    status: 'connected',
    authResponse: { accessToken: 'test-access-token' },
  }),
}))

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
    expect(wrapper.emitted('google')).toBeUndefined()
    expect(wrapper.emitted('facebook')).toBeUndefined()
  })
  it('emite evento "google" al hacer clic', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[0]!.trigger('click')

    expect(wrapper.emitted('google')).toHaveLength(1)
  })

  it('emite evento "facebook" al hacer clic', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('facebook')).toHaveLength(1)
    expect(wrapper.emitted('facebook')?.[0]).toEqual(['test-access-token'])
  })
})
