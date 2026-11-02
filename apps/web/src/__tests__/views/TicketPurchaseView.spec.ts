import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TicketPurchaseView from '@/views/TicketPurchaseView.vue'
import FunctionSelectionStep from '@/components/purchases/FunctionSelectionStep.vue'
import SeatSelectionStep from '@/components/purchases/SeatSelectionStep.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { establishClientSession, clearClientSession } from '@/services/client-session.service'
import {
  getPurchaseFunctions,
  getPurchaseSeats,
  quotePurchase,
  confirmPurchase,
} from '@/services/purchase.service'
const navigation = vi.hoisted(() => ({ replace: vi.fn(), route: { query: { movieId: '2' } } }))
vi.mock('vue-router', () => ({ useRoute: () => navigation.route, useRouter: () => navigation }))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  getPurchaseFunctions: vi.fn(),
  getPurchaseSeats: vi.fn(),
  quotePurchase: vi.fn(),
  confirmPurchase: vi.fn(),
  purchaseError: () => 'No se pudo completar.',
}))
let wrapper: ReturnType<typeof mount>
const context = {
  id: 4,
  movieId: 2,
  title: 'Película',
  synopsis: 'Historia',
  branchName: 'Central',
  branchId: 1,
  theaterId: 3,
  rows: 1,
  columns: 1,
  startsAt: '2099-01-01T20:00:00-06:00',
  format: '2D',
  technology: 'STANDARD',
  isPremiere: false,
  price: 3000,
}
const seat = {
  positionId: 1,
  theaterId: 3,
  rowNumber: 1,
  columnNumber: 1,
  type: 'normal',
  state: 'free',
}
function render() {
  wrapper = mount(TicketPurchaseView, {
    attachTo: document.body,
    global: {
      stubs: {
        AppHeader: true,
        AppFooter: true,
        RouterLink: { template: '<a><slot/></a>' },
        FunctionSelectionStep: true,
        SeatSelectionStep: true,
        PurchaseSummary: true,
      },
    },
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  navigation.route = reactive({ query: { movieId: '2' } })
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'token',
  )
  vi.mocked(getPurchaseFunctions).mockResolvedValue({
    movie: { id: 2, title: 'Película', synopsis: 'Historia', posterImage: '' },
    functions: [context],
  } as never)
  vi.mocked(getPurchaseSeats).mockResolvedValue({
    function: context,
    seats: [seat],
    categories: [],
  } as never)
  vi.mocked(quotePurchase).mockResolvedValue({
    function: context,
    seats: [{ ...seat, category: 'GENERAL' }],
    lines: [],
    quantity: 1,
    total: 3000,
    version: 'hash',
  } as never)
  vi.mocked(confirmPurchase).mockResolvedValue({
    id: 12,
    function: context,
    lines: [],
    tickets: [],
    total: 3000,
    reference: 'ORD-000012',
  } as never)
})
afterEach(() => {
  wrapper?.unmount()
  clearClientSession()
  document.body.innerHTML = ''
})
describe('TicketPurchaseView', () => {
  it('completes function, seat, review and simulated payment through reusable steps', async () => {
    render()
    await flushPromises()
    wrapper.getComponent(FunctionSelectionStep).vm.$emit('select', 4)
    await flushPromises()
    const seats = wrapper.getComponent(SeatSelectionStep)
    seats.vm.$emit('selection', [seat])
    seats.vm.$emit('category', 1, 'CHILD')
    seats.vm.$emit('continue')
    await flushPromises()
    expect(wrapper.text()).toContain('Revisa tu compra')
    expect(wrapper.text()).not.toContain('Pago simulado')
    expect(wrapper.text()).not.toContain('comprobarán nuevamente')
    expect(wrapper.text()).not.toContain('Ver mis compras')
    expect(seats.isVisible()).toBe(false)
    expect(wrapper.findComponent(PurchaseSummary).exists()).toBe(true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Volver a los asientos')!
      .trigger('click')
    expect(seats.isVisible()).toBe(true)
    seats.vm.$emit('continue')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pagar')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('¡Compra exitosa!')
    expect(wrapper.text()).not.toContain('pago simulado')
    expect(confirmPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ seats: { GENERAL: [], CHILD: [1], SENIOR: [] } }),
    )
  })
  it('requires a movie ID and redirects only once on expired sessions', async () => {
    navigation.route.query.movieId = 'bad'
    render()
    await flushPromises()
    expect(getPurchaseFunctions).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Elige una película')
    navigation.route.query.movieId = '2'
    vi.mocked(getPurchaseFunctions).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    })
    await flushPromises()
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith({
      path: '/',
      query: { login: 'client', reason: 'expired' },
    })
  })
  it('keeps the retry screen after a timeout followed by a lock conflict and recovers the receipt', async () => {
    vi.mocked(confirmPurchase)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
    render()
    await flushPromises()
    wrapper.getComponent(FunctionSelectionStep).vm.$emit('select', 4)
    await flushPromises()
    const seats = wrapper.getComponent(SeatSelectionStep)
    seats.vm.$emit('selection', [seat])
    seats.vm.$emit('continue')
    await flushPromises()
    await wrapper.get('.purchase-action.primary').trigger('click')
    await flushPromises()
    const original = vi.mocked(confirmPurchase).mock.calls[0]![0]
    await wrapper.get('.purchase-action.primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Revisa tu compra')
    expect(wrapper.get('.purchase-action.primary').text()).toBe('Reintentar pago')
    expect(wrapper.get('.actions button').attributes('disabled')).toBeDefined()
    expect(seats.props('disabled')).toBe(true)
    expect(seats.isVisible()).toBe(false)
    expect(wrapper.getComponent(NotificationPopup).props()).toMatchObject({
      duration: 0,
      placement: 'bottom-right',
    })
    expect(wrapper.text()).toContain('Historial de compras')
    expect(getPurchaseSeats).toHaveBeenCalledTimes(1)
    expect(vi.mocked(confirmPurchase).mock.calls[1]![0]).toEqual(original)
    await wrapper.get('.purchase-action.primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('¡Compra exitosa!')
    expect(wrapper.find('.actions').exists()).toBe(false)
    expect(vi.mocked(confirmPurchase).mock.calls[2]![0]).toEqual(original)
  })
})
