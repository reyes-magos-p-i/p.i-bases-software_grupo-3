import { beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks duplicate provider requests and notifies its parent until completion', async () => {
    let resolve!: (value: {
      id: number
      email: string
      firstName: string
      lastName: string
    }) => void
    loginWithGoogle.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const wrapper = mount(SocialAuthButtons)
    await wrapper.findAll('button')[0]!.trigger('click')
    for (const button of wrapper.findAll('button')) await button.trigger('click')
    expect(loginWithGoogle).toHaveBeenCalledTimes(1)
    expect(loginWithFacebook).not.toHaveBeenCalled()
    expect(wrapper.emitted('busy')).toEqual([[true]])
    resolve({ id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' })
    await flushPromises()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    expect(wrapper.findAll('button').every((button) => !button.element.disabled)).toBe(true)
    wrapper.unmount()
  })

  it.each(['google', 'facebook'] as const)(
    'unlocks the buttons after a %s failure',
    async (provider) => {
      const action = provider === 'google' ? loginWithGoogle : vi.mocked(loginWithFacebook)
      action.mockRejectedValueOnce(new Error('Provider unavailable'))
      const wrapper = mount(SocialAuthButtons)
      await wrapper.findAll('button')[provider === 'google' ? 0 : 1]!.trigger('click')
      await flushPromises()
      expect(wrapper.emitted('error')).toHaveLength(1)
      expect(wrapper.emitted('busy')).toEqual([[true], [false]])
      expect(wrapper.emitted('authenticated')).toBeUndefined()
      wrapper.unmount()
    },
  )

  it('unlocks after a cancelled Facebook dialog without creating a session', async () => {
    vi.mocked(loginWithFacebook).mockResolvedValueOnce({
      status: 'unknown',
      authResponse: null,
    } as unknown as fb.StatusResponse)
    const wrapper = mount(SocialAuthButtons)
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(facebookLogin).not.toHaveBeenCalled()
    expect(wrapper.emitted('authenticated')).toBeUndefined()
    expect(wrapper.emitted('busy')).toEqual([[true], [false]])
    wrapper.unmount()
  })
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
