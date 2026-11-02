import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GuestPurchaseAccess from '@/components/purchases/GuestPurchaseAccess.vue'
afterEach(() => vi.unstubAllGlobals())
describe('Private consultation code', () => {
  it('shows and copies the code without promising email delivery or changing the QR', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(GuestPurchaseAccess, { props: { accessCode: 'private-code' } })
    expect(wrapper.get('code').text()).toBe('private-code')
    expect(wrapper.text()).toContain('Mantenlo privado')
    expect(wrapper.text()).not.toContain('enviamos')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('private-code')
    expect(wrapper.get('button').text()).toBe('Código copiado')
    wrapper.unmount()
  })
  it('keeps the code selectable when clipboard access fails or is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mount(GuestPurchaseAccess, { props: { accessCode: 'private-code' } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Selecciona el código')
    expect(wrapper.get('code').text()).toBe('private-code')
    wrapper.unmount()
  })
})
