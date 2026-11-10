import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GuestPurchaseAccess from '@/components/purchases/GuestPurchaseAccess.vue'
afterEach(() => vi.unstubAllGlobals())
const code = '12.4AVG75NWK52Z476W4QDMW7DYQE'
const link = new URL('/guest-purchases/receipt#' + code, window.location.origin).toString()

describe('Private receipt link', () => {
  it('opens and copies the receipt link without promising email delivery', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(GuestPurchaseAccess, { props: { accessCode: code } })
    expect(wrapper.get('a').attributes('href')).toBe(link)
    expect(wrapper.get('a').text()).toBe('Ver mi compra')
    expect(wrapper.find('code').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mantenlo privado')
    expect(wrapper.text()).not.toContain('enviamos')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(link)
    expect(wrapper.get('button').text()).toBe('Enlace copiado')
    await wrapper.setProps({ accessCode: '13.4AVG75NWK52Z476W4QDMW7DYQE' })
    expect(wrapper.get('button').text()).toBe('Copiar enlace')
    wrapper.unmount()
  })
  it('keeps the link selectable when clipboard access is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mount(GuestPurchaseAccess, { props: { accessCode: code } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Selecciona el enlace')
    expect(wrapper.get('.selectable-link').text()).toBe(link)
    expect(wrapper.get('.selectable-link').attributes('href')).toBe(link)
    wrapper.unmount()
  })
  it('allows another copy attempt after the clipboard rejects access', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(GuestPurchaseAccess, { props: { accessCode: code } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('button').text()).toBe('Enlace copiado')
    expect(writeText).toHaveBeenLastCalledWith(link)
    wrapper.unmount()
  })
})
