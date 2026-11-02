import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ClientPurchasesPanel from '@/components/purchases/ClientPurchasesPanel.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import QrCode from '@/components/common/QrCode.vue'
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
  it('shows the selected purchase QR without navigation and preserves it on reopening', async () => {
    vi.mocked(getMyPurchase).mockResolvedValue({
      id: 12,
      reference: 'ORD-000012',
      purchasedAt: '2099-01-01T12:00:00-06:00',
      status: 'PAID',
      buyerEmail: 'ana@example.com',
      total: 3000,
      function: {
        id: 4,
        title: 'Película',
        branchName: 'Central',
        theaterId: 3,
        startsAt: '2099-01-01T20:00:00-06:00',
        format: '2D',
        technology: 'STANDARD',
        isPremiere: false,
      },
      lines: [],
      tickets: [],
    } as never)
    wrapper = mount(ClientPurchasesPanel)
    await flushPromises()
    expect(getMyPurchase).not.toHaveBeenCalled()
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(getMyPurchase).toHaveBeenCalledExactlyOnceWith(12, expect.any(AbortSignal))
    const code = wrapper.getComponent(QrCode).props('value')
    expect(JSON.parse(code)).toEqual({
      type: 'CINETADEL_PURCHASE',
      version: 1,
      reference: 'ORD-000012',
    })
    expect(wrapper.find('a').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.purchases').exists()).toBe(true)
    expect(wrapper.findComponent(QrCode).exists()).toBe(false)
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(QrCode).props('value')).toBe(code)
    expect(getMyPurchases).toHaveBeenCalledExactlyOnceWith(1, expect.any(AbortSignal))
  })
  it('keeps the history available when a selected receipt cannot be found', async () => {
    vi.mocked(getMyPurchase)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } })
      .mockResolvedValue({ id: 12 } as never)
    wrapper = mount(ClientPurchasesPanel, {
      global: { stubs: { PurchaseSummary: true } },
    })
    await flushPromises()
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(false)
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(true)
    expect(wrapper.find('.purchases').exists()).toBe(true)
    await wrapper.get('.purchases button').trigger('click')
    await flushPromises()
    expect(getMyPurchase).toHaveBeenCalledTimes(2)
    expect(wrapper.getComponent(PurchaseSummary).props('purchase')).toEqual({ id: 12 })
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
  })
})
