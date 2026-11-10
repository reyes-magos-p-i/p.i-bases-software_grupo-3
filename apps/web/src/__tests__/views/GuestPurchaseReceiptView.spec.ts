import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import GuestPurchaseReceiptView from '@/views/GuestPurchaseReceiptView.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { lookupGuestPurchase } from '@/services/guest-purchase.service'
import type { GuestPurchaseReceipt } from '@/types/purchase'

vi.mock('@/services/guest-purchase.service', () => ({ lookupGuestPurchase: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  purchaseError: () => 'No se pudo cargar la compra. Intenta nuevamente.',
}))

let wrapper: VueWrapper | undefined
let router: Router
const code = '12.4AVG75NWK52Z476W4QDMW7DYQE'
const otherCode = '13.4AVG75NWK52Z476W4QDMW7DYQE'
const receipt = { id: 12, accessCode: code } as GuestPurchaseReceipt

async function render(hash = '#' + code) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p>Portal</p>' } },
      { path: '/guest-purchases/receipt', component: GuestPurchaseReceiptView },
    ],
  })
  await router.push('/guest-purchases/receipt' + hash)
  wrapper = mount(GuestPurchaseReceiptView, {
    global: {
      plugins: [router],
      stubs: { AppHeader: true, AppFooter: true, PurchaseSummary: true },
    },
  })
  return wrapper
}
beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
})

describe('Guest purchase receipt links', () => {
  it('opens the shared receipt automatically without an input form or a session', async () => {
    vi.mocked(lookupGuestPurchase).mockResolvedValue(receipt)
    const view = await render()
    await flushPromises()
    expect(lookupGuestPurchase).toHaveBeenCalledWith(code, expect.any(AbortSignal))
    expect(view.getComponent(PurchaseSummary).props('purchase')).toEqual(receipt)
    expect(view.find('form').exists()).toBe(false)
    expect(view.find('input').exists()).toBe(false)
    expect(view.get('a[href="/"]').text()).toContain('Volver al portal')
    expect(router.currentRoute.value.hash).toBe('#' + code)
  })
  it.each(['', '#ORD-000012', '#%ZZ'])('rejects an invalid link locally: %s', async (hash) => {
    const view = await render(hash)
    await flushPromises()
    expect(lookupGuestPurchase).not.toHaveBeenCalled()
    expect(view.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(view.find('main > button').exists()).toBe(false)
    expect(view.getComponent(NotificationPopup).props('message')).toContain('enlace')
    expect(view.text()).toContain('Abre el enlace completo')
  })
  it('shows a request failure once at the bottom right and allows retry after a timeout', async () => {
    vi.mocked(lookupGuestPurchase)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(receipt)
    const view = await render()
    await flushPromises()
    const notification = view.getComponent(NotificationPopup)
    expect(notification.props('placement')).toBe('bottom-right')
    expect(notification.props('duration')).toBe(0)
    notification.vm.$emit('close')
    await flushPromises()
    expect(view.findComponent(NotificationPopup).exists()).toBe(false)
    await view.get('main > button').trigger('click')
    await flushPromises()
    expect(lookupGuestPurchase).toHaveBeenCalledTimes(2)
    expect(view.getComponent(PurchaseSummary).props('purchase')).toEqual(receipt)
  })
  it('uses the shared dark loading state and prevents overlapping retries', async () => {
    let resolve!: (value: GuestPurchaseReceipt) => void
    vi.mocked(lookupGuestPurchase)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done
        }),
      )
    const view = await render()
    await flushPromises()
    const retry = view.get('main > button')
    await retry.trigger('click')
    await retry.trigger('click')
    expect(lookupGuestPurchase).toHaveBeenCalledTimes(2)
    expect(view.getComponent(LoadingState).props('surface')).toBe('dark')
    expect(view.find('main > button').exists()).toBe(false)
    resolve(receipt)
    await flushPromises()
    expect(view.findComponent(LoadingState).exists()).toBe(false)
    expect(view.findComponent(PurchaseSummary).exists()).toBe(true)
  })
  it.each(['resolve', 'reject'] as const)(
    'cancels a lookup on leaving and ignores a late %s',
    async (outcome) => {
      let resolve!: (value: GuestPurchaseReceipt) => void
      let reject!: (error: Error) => void
      vi.mocked(lookupGuestPurchase).mockReturnValue(
        new Promise((done, fail) => {
          resolve = done
          reject = fail
        }),
      )
      await render()
      const signal = vi.mocked(lookupGuestPurchase).mock.calls[0]![1]!
      wrapper!.unmount()
      wrapper = undefined
      expect(signal.aborted).toBe(true)
      if (outcome === 'resolve') resolve(receipt)
      else reject(new Error('late response'))
      await flushPromises()
      expect(lookupGuestPurchase).toHaveBeenCalledTimes(1)
    },
  )
  it('clears the previous receipt when opening an invalid link in the same view', async () => {
    vi.mocked(lookupGuestPurchase).mockResolvedValue(receipt)
    const view = await render()
    await flushPromises()
    expect(view.findComponent(PurchaseSummary).exists()).toBe(true)
    await router.push('/guest-purchases/receipt#invalid')
    await flushPromises()
    expect(view.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(view.findComponent(LoadingState).exists()).toBe(false)
    expect(lookupGuestPurchase).toHaveBeenCalledTimes(1)
  })
  it.each(['resolve', 'reject'] as const)(
    'ignores an old %s when a different receipt link is loading',
    async (outcome) => {
      let resolve!: (value: GuestPurchaseReceipt) => void
      let reject!: (error: Error) => void
      let resolveCurrent!: (value: GuestPurchaseReceipt) => void
      vi.mocked(lookupGuestPurchase)
        .mockReturnValueOnce(
          new Promise((done, fail) => {
            resolve = done
            reject = fail
          }),
        )
        .mockReturnValueOnce(
          new Promise((done) => {
            resolveCurrent = done
          }),
        )
      const view = await render()
      const signal = vi.mocked(lookupGuestPurchase).mock.calls[0]![1]!
      await router.push('/guest-purchases/receipt#' + otherCode)
      expect(signal.aborted).toBe(true)
      if (outcome === 'resolve') resolve(receipt)
      else reject(new Error('late response'))
      await flushPromises()
      expect(view.findComponent(PurchaseSummary).exists()).toBe(false)
      expect(view.findComponent(NotificationPopup).exists()).toBe(false)
      expect(view.findComponent(LoadingState).exists()).toBe(true)
      const current = { ...receipt, id: 13, accessCode: otherCode }
      resolveCurrent(current)
      await flushPromises()
      expect(view.getComponent(PurchaseSummary).props('purchase')).toEqual(current)
      expect(view.findComponent(LoadingState).exists()).toBe(false)
    },
  )
})
