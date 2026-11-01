import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ClientPurchasesPanel from '@/components/purchases/ClientPurchasesPanel.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { getMyPurchases, getMyPurchase } from '@/services/purchase.service'
import { establishClientSession, clearClientSession } from '@/services/client-session.service'
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  getMyPurchases: vi.fn(),
  getMyPurchase: vi.fn(),
  purchaseError: () => 'No se pudieron consultar las compras.',
}))
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  vi.resetAllMocks()
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'token',
  )
  vi.mocked(getMyPurchases).mockResolvedValue({
    items: [
      {
        id: 12,
        reference: 'ORD-000012',
        title: 'Película',
        purchasedAt: '2099-01-01T12:00:00-06:00',
        startsAt: '2099-01-01T20:00:00-06:00',
        status: 'PAID',
        total: 3000,
        quantity: 1,
      },
    ],
    page: 1,
    total: 11,
    totalPages: 2,
  })
})
afterEach(() => {
  wrapper?.unmount()
  clearClientSession()
})
describe('ClientPurchasesPanel', () => {
  it('paginates personal purchases and opens the selected receipt', async () => {
    wrapper = mount(ClientPurchasesPanel, { global: { stubs: { PurchaseSummary: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('ORD-000012')
    expect(wrapper.get('[aria-label="Página anterior"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="Página siguiente"]').trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith(2, expect.any(AbortSignal))
    vi.mocked(getMyPurchase).mockResolvedValue({ id: 12 } as never)
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(PurchaseSummary).props('purchase')).toEqual({ id: 12 })
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.purchases').exists()).toBe(true)
  })
  it('shows empty results and uses the shared floating notification for failures', async () => {
    vi.mocked(getMyPurchases).mockRejectedValueOnce(new Error('offline'))
    wrapper = mount(ClientPurchasesPanel)
    await flushPromises()
    expect(wrapper.getComponent(NotificationPopup).props('placement')).toBe('bottom-right')
    vi.mocked(getMyPurchases).mockResolvedValue({ items: [], page: 1, total: 0, totalPages: 0 })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Aún no tienes compras')
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
  })
  it('expires unauthorized sessions and ignores a late receipt after logout', async () => {
    wrapper = mount(ClientPurchasesPanel, { global: { stubs: { PurchaseSummary: true } } })
    await flushPromises()
    vi.mocked(getMyPurchase).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    })
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('sessionExpired')).toHaveLength(1)
    let resolve!: (value: never) => void
    vi.mocked(getMyPurchase).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    await wrapper.get('.purchases button').trigger('click')
    clearClientSession()
    resolve({ id: 12 } as never)
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
  })
  it('opens a QR purchase directly and returns to the normal history', async () => {
    vi.mocked(getMyPurchase).mockResolvedValue({ id: 12 } as never)
    wrapper = mount(ClientPurchasesPanel, {
      props: { purchaseId: 12 },
      global: { stubs: { PurchaseSummary: true } },
    })
    await flushPromises()
    expect(getMyPurchase).toHaveBeenCalledExactlyOnceWith(12, expect.any(AbortSignal))
    expect(getMyPurchases).not.toHaveBeenCalled()
    expect(wrapper.getComponent(PurchaseSummary).props('purchase')).toEqual({ id: 12 })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('history')).toHaveLength(1)
    expect(wrapper.find('.purchases').exists()).toBe(true)
    expect(getMyPurchases).toHaveBeenCalledExactlyOnceWith(1, expect.any(AbortSignal))
  })
  it('retries a failed direct purchase without replacing it with another client history', async () => {
    vi.mocked(getMyPurchase)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } })
      .mockResolvedValue({ id: 12 } as never)
    wrapper = mount(ClientPurchasesPanel, {
      props: { purchaseId: 12 },
      global: { stubs: { PurchaseSummary: true } },
    })
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(getMyPurchase).toHaveBeenCalledTimes(2)
    expect(getMyPurchase).toHaveBeenLastCalledWith(12, expect.any(AbortSignal))
    expect(getMyPurchases).not.toHaveBeenCalled()
  })
  it('reacts to another QR link and clears its detail when the link is removed', async () => {
    vi.mocked(getMyPurchase).mockImplementation((id) => Promise.resolve({ id } as never))
    wrapper = mount(ClientPurchasesPanel, {
      props: { purchaseId: 12 },
      global: { stubs: { PurchaseSummary: true } },
    })
    await flushPromises()
    await wrapper.setProps({ purchaseId: 13 })
    await flushPromises()
    expect(wrapper.getComponent(PurchaseSummary).props('purchase')).toEqual({ id: 13 })
    await wrapper.setProps({ purchaseId: null })
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(wrapper.find('.purchases').exists()).toBe(true)
  })
})
