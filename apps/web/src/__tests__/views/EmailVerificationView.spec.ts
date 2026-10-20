import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmailVerificationView from '@/views/EmailVerificationView.vue'

const { confirm, resend, replace, route, InvalidVerificationError } = vi.hoisted(
  () => {
    class InvalidEmailVerificationError extends Error {}
    return {
      confirm: vi.fn(),
      resend: vi.fn(),
      replace: vi.fn(),
      route: { query: { token: 'a'.repeat(64) } },
      InvalidVerificationError: InvalidEmailVerificationError,
    }
  },
)

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

vi.mock('@/services/authService', () => ({
  confirmEmailVerification: confirm,
  resendEmailVerification: resend,
  InvalidEmailVerificationError: InvalidVerificationError,
}))

describe('EmailVerificationView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query.token = 'a'.repeat(64)
  })

  const createWrapper = () =>
    mount(EmailVerificationView, {
      global: {
        stubs: {
          AppHeader: true,
          AppFooter: true,
        },
      },
    })

  it('confirms a valid token and redirects to the portal', async () => {
    confirm.mockResolvedValueOnce({})
    const wrapper = createWrapper()
    await flushPromises()

    expect(confirm).toHaveBeenCalledExactlyOnceWith('a'.repeat(64))
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'home' })
    expect(wrapper.text()).not.toContain('Este enlace ya no es válido')
  })

  it('shows recovery and requests a replacement link for an invalid token', async () => {
    confirm.mockRejectedValueOnce(new InvalidVerificationError())
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('Este enlace ya no es válido')
    await wrapper.get('#verification-email').setValue(' ANA@EXAMPLE.COM ')
    resend.mockResolvedValueOnce(undefined)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(resend).toHaveBeenCalledExactlyOnceWith('ana@example.com')
    expect(wrapper.text()).toContain(
      'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace.',
    )
  })

  it('keeps network failures distinct and retries confirmation', async () => {
    confirm
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({})
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('No se pudo confirmar el correo')
    await wrapper.get('.retry-button').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'home' })
  })

  it('rejects malformed tokens without calling the API', async () => {
    route.query.token = 'not-a-token'
    const wrapper = createWrapper()
    await flushPromises()

    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Este enlace ya no es válido')
  })
})
