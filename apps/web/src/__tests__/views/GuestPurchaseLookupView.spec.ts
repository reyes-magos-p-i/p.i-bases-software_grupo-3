import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import GuestPurchaseLookupView from '@/views/GuestPurchaseLookupView.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { lookupGuestPurchase } from '@/services/guest-purchase.service'
vi.mock('@/services/guest-purchase.service', () => ({ lookupGuestPurchase: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  purchaseError: () => 'No se encontró una compra con ese código de consulta.',
}))
let wrapper: VueWrapper
const code = 'INV-12-' + 'a'.repeat(64)
const render = () =>
  (wrapper = mount(GuestPurchaseLookupView, {
    global: {
      stubs: {
        AppHeader: true,
        AppFooter: true,
        PurchaseSummary: true,
        RouterLink: { template: '<a><slot/></a>' },
      },
    },
  }))
beforeEach(() => vi.resetAllMocks())
afterEach(() => wrapper?.unmount())
describe('Guest purchase lookup', () => {
  it('validates locally and shows the shared receipt only after a successful lookup', async () => {
    render()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Introduce el código de consulta que recibiste')
    await wrapper.get('input').setValue('ORD-000012')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('código de consulta completo')
    expect(lookupGuestPurchase).not.toHaveBeenCalled()
    vi.mocked(lookupGuestPurchase).mockResolvedValue({ id: 12, accessCode: code } as never)
    await wrapper.get('input').setValue(' ' + code + ' ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(lookupGuestPurchase).toHaveBeenCalledWith(code.toUpperCase(), expect.any(AbortSignal))
    expect(wrapper.getComponent(PurchaseSummary).props('purchase')).toEqual({
      id: 12,
      accessCode: code,
    })
  })
  it('shows request errors once in a notification at the bottom right', async () => {
    render()
    vi.mocked(lookupGuestPurchase).mockRejectedValue(new Error('not found'))
    await wrapper.get('input').setValue(code)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(wrapper.getComponent(NotificationPopup).props('placement')).toBe('bottom-right')
    wrapper.getComponent(NotificationPopup).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
  })
  it('disables repeated queries while loading and ignores a response after leaving', async () => {
    let resolve!: (value: never) => void
    vi.mocked(lookupGuestPurchase).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render()
    await wrapper.get('input').setValue(code)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Consultando compra')
    await wrapper.get('form').trigger('submit')
    expect(lookupGuestPurchase).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(lookupGuestPurchase).mock.calls[0]![1]!
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    resolve({ id: 12 } as never)
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
  })
  it('ignores a failed lookup after unmount and validates on ordinary blur', async () => {
    let reject!: (error: Error) => void
    vi.mocked(lookupGuestPurchase).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    render()
    await wrapper.get('input').trigger('blur')
    expect(wrapper.text()).toContain('Introduce el código de consulta que recibiste')
    await wrapper.get('input').setValue(code)
    await wrapper.get('form').trigger('submit')
    wrapper.unmount()
    reject(new Error('late'))
    await flushPromises()
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
  })
  it('accepts a compact grouped code and allows retry after a timeout', async () => {
    vi.mocked(lookupGuestPurchase)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: 12 } as never)
    render()
    await wrapper.get('input').setValue(' 12.4avg-75nw k52z476w4qdmw7dyqe ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(lookupGuestPurchase).toHaveBeenCalledWith(
      '12.4AVG75NWK52Z476W4QDMW7DYQE',
      expect.any(AbortSignal),
    )
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(lookupGuestPurchase).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(true)
  })
})
