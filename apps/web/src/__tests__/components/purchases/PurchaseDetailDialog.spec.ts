import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PurchaseDetailDialog from '@/components/purchases/PurchaseDetailDialog.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import { getMyPurchase } from '@/services/purchase.service'
import { clearClientSession, establishClientSession } from '@/services/client-session.service'
import type { PurchaseReceipt } from '@/types/purchase'

vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({ getMyPurchase: vi.fn() }))

const stubs = {
  BaseModal: {
    props: ['open', 'title'],
    emits: ['close'],
    template: `<div v-if="open" class="modal"><h2>{{ title }}</h2><slot /></div>`,
  },
  PurchaseSummary: true,
}
const ord121 = {
  id: 121,
  reference: 'ORD-000121',
  qrPayload: JSON.stringify({ type: 'CINETADEL_PURCHASE', version: 1, reference: 'ORD-000121' }),
  paymentMethod: 'CARD',
  cardBrand: 'visa',
  cardLast4: '4242',
} as PurchaseReceipt
const failure = (status: number) => ({ isAxiosError: true, response: { status } })
let wrapper: VueWrapper | undefined

async function render(purchaseId: number | null = 121) {
  wrapper = mount(PurchaseDetailDialog, { props: { purchaseId }, global: { stubs } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'token',
  )
  vi.mocked(getMyPurchase).mockResolvedValue(ord121)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearClientSession()
})

describe('PurchaseDetailDialog', () => {
  it('stays closed without a purchase', async () => {
    const dialog = await render(null)
    expect(dialog.find('.modal').exists()).toBe(false)
    expect(getMyPurchase).not.toHaveBeenCalled()
  })

  it('shows the selected purchase with its payment method (UT-060)', async () => {
    const dialog = await render()
    expect(getMyPurchase).toHaveBeenCalledExactlyOnceWith(121, expect.any(AbortSignal))
    expect(dialog.text()).toContain('Detalle de compra')
    const summary = dialog.getComponent(PurchaseSummary)
    expect(summary.props('purchase')).toEqual(ord121)
    expect(summary.props('showPayment')).toBe(true)
    expect(dialog.get('.purchase-detail').element.lastElementChild).toBe(
      dialog.get('footer').element,
    )
    await dialog.get('.detail-footer button').trigger('click')
    expect(dialog.emitted('close')).toHaveLength(1)
  })

  it.each([403, 404])('denies a purchase of another account on %i (UT-073)', async (status) => {
    vi.mocked(getMyPurchase).mockRejectedValue(failure(status))
    const dialog = await render(123)
    expect(dialog.get('[role="alert"]').text()).toBe('No tienes acceso a esta compra')
    expect(dialog.find('.detail-error button').exists()).toBe(false)
    expect(dialog.get('.detail-footer button').text()).toBe('Cerrar')
    expect(dialog.findComponent(PurchaseSummary).exists()).toBe(false)
  })

  it('offers a retry when the detail fails to load (UT-075)', async () => {
    vi.mocked(getMyPurchase).mockRejectedValueOnce(new Error('offline'))
    const dialog = await render(122)
    expect(dialog.get('[role="alert"]').text()).toContain(
      'No se pudo cargar el detalle de la compra, intenta de nuevo',
    )
    expect(dialog.findComponent(PurchaseSummary).exists()).toBe(false)
    await dialog.get('button').trigger('click')
    await flushPromises()
    expect(dialog.find('[role="alert"]').exists()).toBe(false)
    expect(dialog.getComponent(PurchaseSummary).props('purchase')).toEqual(ord121)
  })

  it('reports an expired session', async () => {
    vi.mocked(getMyPurchase).mockRejectedValue(failure(401))
    const dialog = await render()
    expect(dialog.emitted('session-expired')).toHaveLength(1)
  })

  it('clears the previous purchase and drops its late answer', async () => {
    const dialog = await render()
    let resolve!: (value: PurchaseReceipt) => void
    vi.mocked(getMyPurchase).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    await dialog.setProps({ purchaseId: 122 })
    expect(dialog.findComponent(PurchaseSummary).exists()).toBe(false)
    await dialog.setProps({ purchaseId: null })
    resolve({ ...ord121, id: 122 })
    await flushPromises()
    expect(dialog.findComponent(PurchaseSummary).exists()).toBe(false)
  })

  it('ignores answers that arrive after logout', async () => {
    let reject!: (reason: unknown) => void
    vi.mocked(getMyPurchase).mockReturnValueOnce(new Promise((_, fail) => (reject = fail)))
    const dialog = await render()
    clearClientSession()
    reject(new Error('offline'))
    await flushPromises()
    expect(dialog.find('[role="alert"]').exists()).toBe(false)
    expect(dialog.findComponent(PurchaseSummary).exists()).toBe(false)
  })

  it('relays the modal close and aborts when it unmounts', async () => {
    const dialog = await render()
    dialog.getComponent(stubs.BaseModal).vm.$emit('close')
    expect(dialog.emitted('close')).toHaveLength(1)
    vi.mocked(getMyPurchase).mockReturnValueOnce(new Promise(() => undefined))
    await dialog.setProps({ purchaseId: 122 })
    const signal = vi.mocked(getMyPurchase).mock.lastCall![1]!
    dialog.unmount()
    wrapper = undefined
    expect(signal.aborted).toBe(true)
  })
})
