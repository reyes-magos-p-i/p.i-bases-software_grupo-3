import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useTicketPurchase } from '@/composables/useTicketPurchase'
import { establishClientSession, clearClientSession } from '@/services/client-session.service'
import {
  getPurchaseFunctions,
  getPurchaseSeats,
  quotePurchase,
  confirmPurchase,
} from '@/services/purchase.service'
import type { PurchaseFunction, PurchaseSeat } from '@/types/purchase'
import {
  getGuestPurchaseFunctions,
  getGuestPurchaseSeats,
  quoteGuestPurchase,
  confirmGuestPurchase,
  identifyGuestBuyer,
} from '@/services/guest-purchase.service'
vi.mock('@/services/guest-purchase.service', () => ({
  getGuestPurchaseFunctions: vi.fn(),
  getGuestPurchaseSeats: vi.fn(),
  quoteGuestPurchase: vi.fn(),
  confirmGuestPurchase: vi.fn(),
  identifyGuestBuyer: vi.fn(),
}))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  getPurchaseFunctions: vi.fn(),
  getPurchaseSeats: vi.fn(),
  quotePurchase: vi.fn(),
  confirmPurchase: vi.fn(),
  purchaseError: () => 'No se pudo completar la compra.',
}))
const context: PurchaseFunction = {
  id: 4,
  movieId: 2,
  title: 'Película',
  synopsis: 'Historia',
  posterImage: '',
  branchId: 1,
  branchName: 'Cine',
  theaterId: 3,
  rows: 1,
  columns: 2,
  startsAt: '2099-01-01T20:00:00-06:00',
  endsAt: '2099-01-01T22:00:00-06:00',
  status: 'ACTIVE',
  available: true,
  format: '2D',
  technology: 'STANDARD',
  isPremiere: false,
  price: 3000,
}
const seats: PurchaseSeat[] = [1, 2].map((positionId) => ({
  positionId,
  theaterId: 3,
  rowNumber: 1,
  columnNumber: positionId,
  type: 'normal',
  state: 'free',
}))
let flow: ReturnType<typeof useTicketPurchase>,
  wrapper: ReturnType<typeof mount>,
  expired: () => void
const error = (status: number) => ({ isAxiosError: true, response: { status } })
function render() {
  wrapper = mount(
    defineComponent({
      setup() {
        flow = useTicketPurchase(expired)
        return () => null
      },
    }),
  )
}
async function ready() {
  await flow.load(2)
  await flow.chooseFunction(4)
  flow.setSelection([seats[0]!])
  await flow.summarize()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'client-token',
  )
  expired = vi.fn<() => void>()
  vi.mocked(getPurchaseFunctions).mockResolvedValue({
    movie: { id: 2, title: 'Película', synopsis: 'Historia', posterImage: '' },
    functions: [context],
  })
  vi.mocked(getPurchaseSeats).mockResolvedValue({ function: context, seats, categories: [] })
  vi.mocked(quotePurchase).mockResolvedValue({
    function: context,
    seats: [{ ...seats[0]!, category: 'GENERAL' }],
    lines: [],
    total: 3000,
    quantity: 1,
    version: 'hash',
  })
  vi.mocked(confirmPurchase).mockResolvedValue({ id: 12, reference: 'ORD-000012' } as never)
  vi.mocked(getGuestPurchaseFunctions).mockResolvedValue({
    movie: { id: 2, title: 'Película', synopsis: 'Historia', posterImage: '' },
    functions: [context],
  })
  vi.mocked(getGuestPurchaseSeats).mockResolvedValue({ function: context, seats, categories: [] })
  vi.mocked(quoteGuestPurchase).mockResolvedValue({
    function: context,
    seats: [{ ...seats[0]!, category: 'GENERAL' }],
    lines: [],
    total: 3000,
    quantity: 1,
    version: 'hash',
  })
  vi.mocked(identifyGuestBuyer).mockResolvedValue({ email: 'guest@example.com' })
  vi.mocked(confirmGuestPurchase).mockResolvedValue({
    id: 12,
    reference: 'ORD-000012',
    accessCode: 'private',
  } as never)
  render()
})
afterEach(() => {
  wrapper.unmount()
  clearClientSession()
  vi.useRealTimers()
})
describe('Ticket purchase coordination', () => {
  async function guestReady() {
    wrapper.unmount()
    clearClientSession()
    render()
    await flow.load(2)
    await flow.chooseFunction(4)
    flow.setSelection([seats[0]!])
    await flow.summarize()
  }
  const buyer = { email: 'guest@example.com', confirmEmail: 'guest@example.com' }
  it('uses public availability for guests and requires matching email before review', async () => {
    await guestReady()
    expect(flow.guest.value).toBe(true)
    expect(flow.labels.value).toHaveLength(5)
    expect(flow.step.value).toBe(3)
    expect(quoteGuestPurchase).not.toHaveBeenCalled()
    await flow.identify({ email: 'bad', confirmEmail: 'other' })
    expect(identifyGuestBuyer).not.toHaveBeenCalled()
    expect(flow.buyerError.value).toContain('correo válido')
    await flow.identify({ email: ' Guest@Example.com ', confirmEmail: 'GUEST@example.com' })
    expect(identifyGuestBuyer).toHaveBeenCalledWith(buyer)
    expect(flow.guestBuyer.value).toEqual(buyer)
    expect(flow.step.value).toBe(4)
    await flow.pay()
    expect(confirmGuestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ ...buyer, requestKey: expect.any(String) }),
    )
    expect(confirmPurchase).not.toHaveBeenCalled()
    expect(flow.guestReceipt.value?.accessCode).toBe('private')
    expect(flow.step.value).toBe(5)
    expect(expired).not.toHaveBeenCalled()
  })
  it('preserves a guest attempt through a timeout and a lock conflict without falling back to account history', async () => {
    await guestReady()
    await flow.identify(buyer)
    vi.mocked(confirmGuestPurchase)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(error(409))
    await flow.pay()
    const original = vi.mocked(confirmGuestPurchase).mock.calls[0]![0]
    await flow.identify(buyer)
    await flow.pay()
    expect(flow.uncertain.value).toBe(true)
    expect(flow.step.value).toBe(4)
    expect(flow.error.value).not.toContain('Mis compras')
    flow.back()
    flow.setSelection(seats)
    await flow.refresh()
    expect(getGuestPurchaseSeats).toHaveBeenCalledTimes(1)
    await flow.pay()
    expect(vi.mocked(confirmGuestPurchase).mock.calls.map(([data]) => data)).toEqual([
      original,
      original,
      original,
    ])
    expect(flow.guestReceipt.value?.id).toBe(12)
    expect(flow.uncertain.value).toBe(false)
  })
  it('offers login for an existing account without showing the same error as a toast', async () => {
    await guestReady()
    const registered = {
      isAxiosError: true,
      response: { status: 409, data: { code: 'CLIENT_LOGIN_REQUIRED' } },
    }
    vi.mocked(identifyGuestBuyer).mockRejectedValueOnce(registered)
    await flow.identify(buyer)
    expect(flow.loginRequired.value).toBe(true)
    expect(flow.buyerError.value).toContain('No se pudo')
    expect(flow.error.value).toBe('')
    expect(quoteGuestPurchase).not.toHaveBeenCalled()
    await flow.identify(buyer)
    vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(registered)
    await flow.pay()
    expect(flow.step.value).toBe(3)
    expect(flow.quote.value).toBeNull()
    expect(flow.loginRequired.value).toBe(true)
    expect(flow.error.value).toBe('')
  })
  it('preserves selected seats and re-quotes for the account after login', async () => {
    await guestReady()
    establishClientSession(
      { id: 9, email: 'a@example.com', firstName: 'Ana', lastName: '' },
      'new-token',
    )
    await flushPromises()
    expect(flow.guest.value).toBe(false)
    expect(flow.selected.value).toHaveLength(1)
    expect(quotePurchase).toHaveBeenCalledWith({
      functionId: 4,
      seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
    })
    expect(flow.step.value).toBe(3)
    await flow.identify(buyer)
    expect(identifyGuestBuyer).not.toHaveBeenCalled()
    await flow.pay()
    expect(confirmPurchase).toHaveBeenCalled()
    expect(confirmGuestPurchase).not.toHaveBeenCalled()
  })
  it('ignores a late guest identification after login and does not replace the account quote', async () => {
    await guestReady()
    let resolve!: (value: { email: string }) => void
    vi.mocked(identifyGuestBuyer).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const pending = flow.identify(buyer)
    establishClientSession(
      { id: 9, email: 'a@example.com', firstName: 'Ana', lastName: '' },
      'token',
    )
    await flushPromises()
    resolve({ email: buyer.email })
    await pending
    expect(flow.guestBuyer.value).toBeNull()
    expect(flow.guest.value).toBe(false)
    expect(quoteGuestPurchase).not.toHaveBeenCalled()
    expect(flow.quote.value).not.toBeNull()
  })
  it('keeps an uncertain guest payment associated with its original buyer when a client logs in', async () => {
    await guestReady()
    await flow.identify(buyer)
    vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(error(503))
    await flow.pay()
    establishClientSession(
      { id: 9, email: 'a@example.com', firstName: 'Ana', lastName: '' },
      'token',
    )
    await flushPromises()
    expect(flow.guest.value).toBe(true)
    await flow.pay()
    expect(confirmPurchase).not.toHaveBeenCalled()
    expect(flow.guestReceipt.value?.id).toBe(12)
  })
  it('reports guest failures without treating them as a client logout and reloads after login during initial loading', async () => {
    await guestReady()
    vi.mocked(getGuestPurchaseFunctions).mockRejectedValueOnce(error(401))
    await flow.load(2)
    expect(expired).not.toHaveBeenCalled()
    establishClientSession(
      { id: 9, email: 'a@example.com', firstName: 'Ana', lastName: '' },
      'token',
    )
    await flushPromises()
    expect(getPurchaseFunctions).toHaveBeenCalledWith(2, expect.any(AbortSignal))
    expect(flow.movie.value?.id).toBe(2)
  })
  it('loads the selected movie and function, validates empty selection and completes a purchase', async () => {
    await flow.load(2)
    expect(flow.movie.value?.id).toBe(2)
    await flow.chooseFunction(4)
    expect(flow.step.value).toBe(2)
    await flow.summarize()
    expect(flow.error.value).toContain('al menos un asiento')
    flow.setSelection(seats)
    flow.setCategory(2, 'CHILD')
    expect(flow.selection.value).toEqual({
      functionId: 4,
      seats: { GENERAL: [1], CHILD: [2], SENIOR: [] },
    })
    await flow.summarize()
    expect(flow.step.value).toBe(3)
    await flow.pay()
    expect(flow.receipt.value?.id).toBe(12)
    expect(flow.step.value).toBe(4)
    expect(confirmPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        functionId: 4,
        requestKey: expect.any(String),
        quoteVersion: 'hash',
      }),
    )
  })
  it('keeps the same idempotency key after a network failure and freezes the selection until retry', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValueOnce(new Error('offline'))
    await flow.pay()
    const original = vi.mocked(confirmPurchase).mock.calls[0]![0]
    expect(flow.uncertain.value).toBe(true)
    flow.back()
    flow.setSelection(seats)
    flow.setCategory(1, 'SENIOR')
    await flow.chooseFunction(8)
    await flow.summarize()
    expect(flow.step.value).toBe(3)
    expect(flow.selected.value).toHaveLength(1)
    await flow.refresh()
    expect(getPurchaseSeats).toHaveBeenCalledTimes(1)
    await flow.pay()
    expect(vi.mocked(confirmPurchase).mock.calls[1]![0]).toEqual(original)
    expect(flow.uncertain.value).toBe(false)
  })
  it.each([409, 429, 400, 503])(
    'preserves an uncertain attempt after retry status %i until its receipt is recovered',
    async (status) => {
      await ready()
      const originalQuote = flow.quote.value
      vi.mocked(confirmPurchase)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(error(status))
      await flow.pay()
      const original = vi.mocked(confirmPurchase).mock.calls[0]![0]
      await flow.pay()
      expect(flow.uncertain.value).toBe(true)
      expect(flow.busy.value).toBe(false)
      expect(flow.step.value).toBe(3)
      expect(flow.quote.value).toBe(originalQuote)
      expect(flow.receipt.value).toBeNull()
      expect(vi.mocked(confirmPurchase).mock.calls[1]![0]).toEqual(original)
      expect(flow.error.value).toContain('Mis compras')
      flow.back()
      flow.setSelection(seats)
      flow.setCategory(1, 'SENIOR')
      await flow.chooseFunction(8)
      await flow.summarize()
      await flow.refresh()
      await vi.advanceTimersByTimeAsync(10000)
      expect(getPurchaseSeats).toHaveBeenCalledTimes(1)
      expect(flow.selection.value).toEqual({
        functionId: 4,
        seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      })
      await flow.pay()
      expect(vi.mocked(confirmPurchase).mock.calls[2]![0]).toEqual(original)
      expect(flow.receipt.value?.id).toBe(12)
      expect(flow.step.value).toBe(4)
      expect(flow.uncertain.value).toBe(false)
    },
  )
  it('invalidates the quote after selection changes and keeps selection while going back', async () => {
    await ready()
    flow.back()
    expect(flow.step.value).toBe(2)
    flow.setSelection([seats[0]!])
    expect(flow.quote.value).not.toBeNull()
    flow.setSelection(seats)
    expect(flow.quote.value).toBeNull()
    await flow.pay()
    expect(confirmPurchase).not.toHaveBeenCalled()
    flow.back()
    expect(flow.step.value).toBe(1)
  })
  it('removes sold selections after a refresh and requests review instead of silently buying fewer', async () => {
    await ready()
    vi.mocked(getPurchaseSeats).mockResolvedValue({
      function: context,
      seats: [{ ...seats[0]!, state: 'in-use' }, seats[1]!],
      categories: [],
    })
    await flow.refresh()
    expect(flow.selected.value).toHaveLength(0)
    expect(flow.quote.value).toBeNull()
    expect(flow.step.value).toBe(2)
    expect(flow.notice.value).toContain('disponibilidad cambió')
  })
  it('handles a conflict on pay by returning to seat selection', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValue(error(409))
    await flow.pay()
    expect(flow.step.value).toBe(2)
    expect(flow.receipt.value).toBeNull()
    expect(flow.uncertain.value).toBe(false)
    expect(getPurchaseSeats).toHaveBeenCalledTimes(2)
  })
  it('reports load, quote and availability errors and expires unauthorized sessions', async () => {
    vi.mocked(getPurchaseFunctions).mockRejectedValueOnce(error(401))
    await flow.load(2)
    expect(expired).toHaveBeenCalledTimes(1)
    vi.mocked(getPurchaseSeats).mockRejectedValueOnce(error(503))
    await flow.chooseFunction(4)
    expect(flow.error.value).toContain('No se pudo')
    await flow.chooseFunction(4)
    flow.setSelection(seats)
    vi.mocked(quotePurchase).mockRejectedValueOnce(error(409))
    await flow.summarize()
    expect(flow.step.value).toBe(2)
    vi.mocked(getPurchaseSeats).mockRejectedValueOnce(error(409))
    await flow.refresh()
    expect(flow.availability.value).toBeNull()
    expect(flow.step.value).toBe(1)
  })
  it('ignores a late response after a newer login or unmount', async () => {
    let resolve!: (value: never) => void
    vi.mocked(getPurchaseFunctions).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const pending = flow.load(2)
    establishClientSession(
      { id: 9, email: 'b@example.com', firstName: 'Luis', lastName: 'Rojas' },
      'new-token',
    )
    resolve({ movie: { id: 2 }, functions: [] } as never)
    await pending
    expect(flow.movie.value).toBeNull()
    expect(flow.loading.value).toBe(false)
  })
  it('blocks duplicate submits and ignores availability responses overtaken by paying', async () => {
    await ready()
    let resolve!: (value: never) => void
    vi.mocked(confirmPurchase).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const pending = flow.pay()
    await flow.pay()
    await flow.refresh()
    flow.setSelection(seats)
    flow.setCategory(1, 'CHILD')
    flow.back()
    expect(confirmPurchase).toHaveBeenCalledTimes(1)
    resolve({ id: 12 } as never)
    await pending
    expect(flow.receipt.value?.id).toBe(12)
  })
  it('polls only visible pages and removes listeners after unmount', async () => {
    await ready()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await vi.advanceTimersByTimeAsync(10000)
    expect(getPurchaseSeats).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(getPurchaseSeats).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10000)
    expect(getPurchaseSeats).toHaveBeenCalledTimes(3)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10000)
    expect(getPurchaseSeats).toHaveBeenCalledTimes(3)
  })
  it('clears private purchase data on logout and ignores old confirmations', async () => {
    await ready()
    let resolve!: (value: never) => void
    vi.mocked(confirmPurchase).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const pending = flow.pay()
    clearClientSession()
    await nextTick()
    resolve({ id: 12 } as never)
    await pending
    expect(flow.receipt.value).toBeNull()
    expect(flow.quote.value).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })
})
