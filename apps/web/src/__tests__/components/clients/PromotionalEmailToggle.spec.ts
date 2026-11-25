import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PromotionalEmailToggle from '@/components/clients/PromotionalEmailToggle.vue'
import {
  getClientPromotionalEmailSetting,
  saveClientPromotionalEmailSetting,
} from '@/services/client-promotional-emails.service'

vi.mock('@/services/client-promotional-emails.service', () => ({
  getClientPromotionalEmailSetting: vi.fn(),
  saveClientPromotionalEmailSetting: vi.fn(),
}))

describe('PromotionalEmailToggle', () => {
  const toggle = (wrapper: ReturnType<typeof mount>) =>
    wrapper.get<HTMLInputElement>('input[role="switch"]')

  beforeEach(() => {
    vi.mocked(getClientPromotionalEmailSetting).mockReset()
    vi.mocked(saveClientPromotionalEmailSetting).mockReset()
  })

  it('shows the saved opt-in state', async () => {
    vi.mocked(getClientPromotionalEmailSetting).mockResolvedValue({ enabled: true })

    const wrapper = mount(PromotionalEmailToggle)
    await flushPromises()

    expect(toggle(wrapper).element.checked).toBe(true)
    expect(wrapper.text()).toContain('Activado')
  })

  it('saves the new value when the client switches it on', async () => {
    vi.mocked(getClientPromotionalEmailSetting).mockResolvedValue({ enabled: false })
    vi.mocked(saveClientPromotionalEmailSetting).mockResolvedValue({ enabled: true })

    const wrapper = mount(PromotionalEmailToggle)
    await flushPromises()
    await toggle(wrapper).setValue(true)
    await flushPromises()

    expect(saveClientPromotionalEmailSetting).toHaveBeenCalledWith(true)
    expect(wrapper.text()).toContain('Recibirás los anuncios')
  })

  it('reverts the switch and shows an error when saving fails', async () => {
    vi.mocked(getClientPromotionalEmailSetting).mockResolvedValue({ enabled: false })
    vi.mocked(saveClientPromotionalEmailSetting).mockRejectedValue(new Error('offline'))

    const wrapper = mount(PromotionalEmailToggle)
    await flushPromises()
    await toggle(wrapper).setValue(true)
    await flushPromises()

    expect(toggle(wrapper).element.checked).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudo guardar')
  })

  it('offers a retry when loading fails', async () => {
    vi.mocked(getClientPromotionalEmailSetting).mockRejectedValueOnce(new Error('offline'))
    vi.mocked(getClientPromotionalEmailSetting).mockResolvedValueOnce({ enabled: true })

    const wrapper = mount(PromotionalEmailToggle)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudo cargar')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(toggle(wrapper).element.checked).toBe(true)
  })
})
