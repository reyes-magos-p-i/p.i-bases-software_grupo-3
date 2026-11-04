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
import type {
  PurchaseFunction,
  PurchaseSeat,
  PurchaseSelection,
  TicketCategory,
} from '@/types/purchase'
import { loadPurchaseAttempt } from '@/services/purchase-attempt.service'
import { PurchaseResponseError } from '@/utils/purchase-response'
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
const conflict = (code: string) => ({
  isAxiosError: true,
  response: { status: 409, data: { code } },
})
function quoted(data: PurchaseSelection) {
  const selected = Object.entries(data.seats).flatMap(([category, positions]) =>
    positions.map((position) => ({
      ...seats[position - 1]!,
      category: category as TicketCategory,
    })),
  )
  return {
    function: context,
    seats: selected,
    lines: [],
    total: selected.length * 3000,
    quantity: selected.length,
    version: 'a'.repeat(64),
  }
}
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
  sessionStorage.clear()
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'client-token',
  )
  expired = vi.fn<() => void>()
  vi.mocked(getPurchaseFunctions).mockResolvedValue({
    movie: { id: 2, title: 'Película', synopsis: 'Historia', posterImage: '' },
    functions: [context],
  })
  vi.mocked(getPurchaseSeats).mockResolvedValue({
    function: context,
    seats,
    categories: [],
    maxTickets: 10,
  })
  vi.mocked(quotePurchase).mockImplementation((data) => Promise.resolve(quoted(data)))
  vi.mocked(confirmPurchase).mockResolvedValue({ id: 12, reference: 'ORD-000012' } as never)
  vi.mocked(getGuestPurchaseFunctions).mockResolvedValue({
    movie: { id: 2, title: 'Película', synopsis: 'Historia', posterImage: '' },
    functions: [context],
  })
  vi.mocked(getGuestPurchaseSeats).mockResolvedValue({
    function: context,
    seats,
    categories: [],
    maxTickets: 10,
  })
  vi.mocked(quoteGuestPurchase).mockImplementation((data) => Promise.resolve(quoted(data)))
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
  sessionStorage.clear()
  vi.restoreAllMocks()
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
    expect(identifyGuestBuyer).toHaveBeenCalledWith(buyer, expect.any(AbortSignal))
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
    expect(quotePurchase).toHaveBeenCalledWith(
      {
        functionId: 4,
        seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
      },
      expect.any(AbortSignal),
    )
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
        quoteVersion: 'a'.repeat(64),
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
      expect(flow.error.value).toContain('Historial de compras')
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
      maxTickets: 10,
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
    await flushPromises()
    expect(flow.movie.value?.title).toBe('Película')
    expect(getPurchaseFunctions).toHaveBeenCalledTimes(2)
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
  it('restores an uncertain guest payment after reload without sending payment automatically', async () => {
    await guestReady()
    await flow.identify(buyer)
    vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(new Error('timeout'))
    await flow.pay()
    const original = vi.mocked(confirmGuestPurchase).mock.calls[0]![0]
    expect(loadPurchaseAttempt()?.requestKey).toBe(original.requestKey)
    wrapper.unmount()
    render()
    await flow.load(99)
    expect(flow.restored.value).toBe(true)
    expect(flow.movie.value?.id).toBe(2)
    expect(flow.step.value).toBe(4)
    expect(flow.guestBuyer.value).toEqual(buyer)
    expect(flow.selection.value.seats.GENERAL).toEqual([1])
    expect(confirmGuestPurchase).toHaveBeenCalledTimes(1)
    expect(getGuestPurchaseFunctions).toHaveBeenCalledTimes(1)
    await flow.pay()
    expect(vi.mocked(confirmGuestPurchase).mock.calls[1]![0]).toEqual(original)
    expect(flow.guestReceipt.value?.id).toBe(12)
    expect(loadPurchaseAttempt()).toBeNull()
    expect(flow.restored.value).toBe(false)
  })
  it('restores an account payment only for the original client', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValueOnce(new PurchaseResponseError())
    await flow.pay()
    const original = vi.mocked(confirmPurchase).mock.calls[0]![0]
    wrapper.unmount()
    render()
    await flow.load(2)
    expect(flow.guest.value).toBe(false)
    expect(flow.restored.value).toBe(true)
    expect(flow.step.value).toBe(3)
    await flow.pay()
    expect(vi.mocked(confirmPurchase).mock.calls[1]![0]).toEqual(original)
    expect(loadPurchaseAttempt()).toBeNull()
  })
  it('does not show another client’s pending selection after the account changes', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValueOnce(new Error('timeout'))
    await flow.pay()
    wrapper.unmount()
    establishClientSession(
      { id: 9, email: 'b@example.com', firstName: 'Luis', lastName: '' },
      'new-token',
    )
    render()
    await flow.load(2)
    expect(flow.restored.value).toBe(false)
    expect(flow.quote.value).toBeNull()
    expect(flow.selected.value).toEqual([])
    expect(loadPurchaseAttempt()).toBeNull()
    expect(confirmPurchase).toHaveBeenCalledTimes(1)
  })
  it('keeps movie changes from discarding a payment in progress or with an uncertain result', async () => {
    await ready()
    let reject!: (error: Error) => void
    vi.mocked(confirmPurchase).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const pending = flow.pay()
    await flow.load(99)
    expect(flow.movie.value?.id).toBe(2)
    expect(flow.busy.value).toBe(true)
    reject(new Error('timeout'))
    await pending
    await flow.load(99)
    expect(flow.notice.value).toContain('compra pendiente')
    expect(flow.uncertain.value).toBe(true)
    expect(getPurchaseFunctions).toHaveBeenCalledTimes(1)
    expect(loadPurchaseAttempt()).not.toBeNull()
  })
  it('does not submit if the pending attempt cannot be saved', async () => {
    await ready()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    await flow.pay()
    expect(confirmPurchase).not.toHaveBeenCalled()
    expect(flow.uncertain.value).toBe(false)
    expect(flow.busy.value).toBe(false)
    expect(flow.error.value).toContain('No se pudo guardar o recuperar')
  })
  it('reports corrupted pending data once and allows explicitly starting again', async () => {
    sessionStorage.setItem('cinetadel.pending-purchase', '{')
    await flow.load(2)
    expect(getPurchaseFunctions).not.toHaveBeenCalled()
    expect(flow.movie.value).toBeNull()
    expect(flow.error.value).toContain('comprueba el resultado de la compra')
    expect(loadPurchaseAttempt()).toBeNull()
    expect(flow.canRestart.value).toBe(true)
    await flow.restart()
    expect(flow.movie.value?.id).toBe(2)
    expect(flow.error.value).toBe('')
    expect(flow.canRestart.value).toBe(false)
    expect(confirmPurchase).not.toHaveBeenCalled()
  })
  it.each([
    'QUOTE_CHANGED',
    'SEATS_UNAVAILABLE',
    'FUNCTION_UNAVAILABLE',
    'TICKET_LIMIT_REACHED',
    'GUEST_EMAIL_LIMIT',
  ])('releases a previously uncertain attempt after a definitive %s rejection', async (code) => {
    await ready()
    vi.mocked(confirmPurchase)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(conflict(code))
    await flow.pay()
    await flow.pay()
    expect(flow.uncertain.value).toBe(false)
    expect(flow.quote.value).toBeNull()
    expect(flow.step.value).toBe(2)
    expect(loadPurchaseAttempt()).toBeNull()
    expect(getPurchaseSeats).toHaveBeenCalledTimes(2)
  })
  it('preserves the request on a temporary lock conflict even on the first attempt', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValueOnce(conflict('PURCHASE_BUSY'))
    await flow.pay()
    expect(flow.uncertain.value).toBe(true)
    expect(flow.step.value).toBe(3)
    expect(flow.canRestart.value).toBe(false)
    await flow.restart()
    expect(getPurchaseFunctions).toHaveBeenCalledTimes(1)
    const original = vi.mocked(confirmPurchase).mock.calls[0]![0]
    await flow.pay()
    expect(vi.mocked(confirmPurchase).mock.calls[1]![0]).toEqual(original)
    expect(flow.receipt.value?.id).toBe(12)
  })
  it('adopts a login after a definite guest rejection, without losing the selection', async () => {
    await guestReady()
    await flow.identify(buyer)
    let reject!: (error: unknown) => void
    vi.mocked(confirmGuestPurchase).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const pending = flow.pay()
    establishClientSession({ id: 9, email: buyer.email, firstName: 'Ana', lastName: '' }, 'token')
    await nextTick()
    expect(flow.guest.value).toBe(true)
    reject(conflict('CLIENT_LOGIN_REQUIRED'))
    await pending
    await flushPromises()
    expect(flow.guest.value).toBe(false)
    expect(flow.selected.value).toHaveLength(1)
    expect(flow.step.value).toBe(3)
    expect(flow.quote.value).not.toBeNull()
    expect(loadPurchaseAttempt()).toBeNull()
  })
  it('retains the original guest receipt when a login occurs while payment succeeds', async () => {
    await guestReady()
    await flow.identify(buyer)
    let resolve!: (value: never) => void
    vi.mocked(confirmGuestPurchase).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const pending = flow.pay()
    establishClientSession({ id: 9, email: buyer.email, firstName: 'Ana', lastName: '' }, 'token')
    await nextTick()
    resolve({ id: 12, accessCode: 'private' } as never)
    await pending
    expect(flow.guest.value).toBe(true)
    expect(flow.step.value).toBe(5)
    expect(flow.guestReceipt.value?.accessCode).toBe('private')
    expect(quotePurchase).not.toHaveBeenCalled()
  })
  it('does not let an old confirmation unlock a newer client’s payment', async () => {
    await ready()
    let oldDone!: (value: never) => void, newDone!: (value: never) => void
    vi.mocked(confirmPurchase).mockReturnValueOnce(
      new Promise((done) => {
        oldDone = done
      }),
    )
    const oldPayment = flow.pay()
    establishClientSession(
      { id: 9, email: 'b@example.com', firstName: 'Luis', lastName: '' },
      'new-token',
    )
    await flushPromises()
    await flow.chooseFunction(4)
    flow.setSelection([seats[1]!])
    await flow.summarize()
    vi.mocked(confirmPurchase).mockReturnValueOnce(
      new Promise((done) => {
        newDone = done
      }),
    )
    const newPayment = flow.pay()
    oldDone({ id: 12 } as never)
    await oldPayment
    expect(flow.busy.value).toBe(true)
    expect(flow.receipt.value).toBeNull()
    expect(loadPurchaseAttempt()?.selection.seats.GENERAL).toEqual([2])
    newDone({ id: 13 } as never)
    await newPayment
    expect(flow.receipt.value?.id).toBe(13)
    expect(flow.busy.value).toBe(false)
  })
  it('does not let an old quote stop the loading indicator of a newer request', async () => {
    await flow.load(2)
    await flow.chooseFunction(4)
    flow.setSelection([seats[0]!])
    let quoteDone!: (value: never) => void, loadDone!: (value: never) => void
    vi.mocked(quotePurchase).mockReturnValueOnce(
      new Promise((done) => {
        quoteDone = done
      }),
    )
    const old = flow.summarize()
    const signal = vi.mocked(quotePurchase).mock.calls[0]![1]!
    vi.mocked(getPurchaseFunctions).mockReturnValueOnce(
      new Promise((done) => {
        loadDone = done
      }),
    )
    const newer = flow.load(3)
    expect(signal.aborted).toBe(true)
    quoteDone(quoted({ functionId: 4, seats: { GENERAL: [1], CHILD: [], SENIOR: [] } }) as never)
    await old
    expect(flow.loading.value).toBe(true)
    expect(flow.quote.value).toBeNull()
    loadDone({ movie: { id: 3 }, functions: [] } as never)
    await newer
    expect(flow.loading.value).toBe(false)
    expect(flow.movie.value?.id).toBe(3)
  })
  it('aborts guest identification on unmount and ignores the late error', async () => {
    await guestReady()
    let reject!: (error: Error) => void
    vi.mocked(identifyGuestBuyer).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const pending = flow.identify(buyer)
    const signal = vi.mocked(identifyGuestBuyer).mock.calls[0]![1]!
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    reject(new Error('late timeout'))
    await pending
    expect(flow.buyerError.value).toBe('')
    expect(quoteGuestPurchase).not.toHaveBeenCalled()
  })
  it.each(['client', 'guest'])(
    'unlocks a %s checkout after an uncertain payment is definitively rejected with 404',
    async (buyerType) => {
      if (buyerType === 'guest') {
        await guestReady()
        await flow.identify(buyer)
        vi.mocked(confirmGuestPurchase)
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(error(404))
      } else {
        await ready()
        vi.mocked(confirmPurchase)
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(error(404))
      }
      await flow.pay()
      expect(flow.uncertain.value).toBe(true)
      await flow.pay()
      expect(flow.uncertain.value).toBe(false)
      expect(flow.canRestart.value).toBe(true)
      expect(flow.step.value).toBe(1)
      expect(flow.quote.value).toBeNull()
      expect(flow.functions.value).toEqual([context])
      expect(loadPurchaseAttempt()).toBeNull()
      expect(flow.error.value).toContain('No se pudo')
      await flow.restart()
      expect(flow.canRestart.value).toBe(false)
      await flow.chooseFunction(4)
      expect(flow.step.value).toBe(2)
    },
  )
  it.each([
    'QUOTE_CHANGED',
    'SEATS_UNAVAILABLE',
    'FUNCTION_UNAVAILABLE',
    'CLIENT_LOGIN_REQUIRED',
    'CLIENT_ACCOUNT_INACTIVE',
    'CLIENT_VERIFICATION_REQUIRED',
  ])('reloads showtimes after a restored guest attempt is rejected with %s', async (code) => {
    await guestReady()
    await flow.identify(buyer)
    vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(new Error('timeout'))
    await flow.pay()
    wrapper.unmount()
    render()
    await flow.load(2)
    expect(flow.functions.value).toEqual([])
    expect(flow.restored.value).toBe(true)
    vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(conflict(code))
    await flow.pay()
    expect(flow.functions.value).toEqual([context])
    expect(flow.step.value).toBe(1)
    expect(flow.busy.value).toBe(false)
    expect(flow.loading.value).toBe(false)
    expect(flow.uncertain.value).toBe(false)
    expect(flow.restored.value).toBe(false)
    expect(flow.canRestart.value).toBe(true)
    expect(loadPurchaseAttempt()).toBeNull()
    expect(getGuestPurchaseFunctions).toHaveBeenCalledTimes(2)
    await flow.chooseFunction(4)
    expect(flow.canRestart.value).toBe(false)
    expect(flow.availability.value?.seats).toHaveLength(2)
  })
  it.each(['CLIENT_ACCOUNT_INACTIVE', 'CLIENT_VERIFICATION_REQUIRED'])(
    'returns to email without requesting an impossible login on %s',
    async (code) => {
      await guestReady()
      vi.mocked(identifyGuestBuyer).mockRejectedValueOnce(conflict(code))
      await flow.identify(buyer)
      expect(flow.loginRequired.value).toBe(false)
      expect(flow.buyerError.value).toContain('No se pudo')
      await flow.identify(buyer)
      vi.mocked(confirmGuestPurchase).mockRejectedValueOnce(conflict(code))
      await flow.pay()
      expect(flow.step.value).toBe(3)
      expect(flow.loginRequired.value).toBe(false)
      expect(flow.buyerError.value).toContain('No se pudo')
      expect(flow.error.value).toBe('')
      expect(flow.quote.value).toBeNull()
      expect(flow.canRestart.value).toBe(true)
      expect(loadPurchaseAttempt()).toBeNull()
    },
  )
  it('does not offer a false recovery if browser storage cannot be cleared', async () => {
    sessionStorage.setItem('cinetadel.pending-purchase', '{')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    await flow.load(2)
    expect(flow.canRestart.value).toBe(false)
    expect(flow.error.value).toContain('navegador permite guardar datos')
    expect(getPurchaseFunctions).not.toHaveBeenCalled()
  })
  it('preserves the rejection and exposes a safe retry if reloading the catalog fails', async () => {
    await ready()
    vi.mocked(confirmPurchase).mockRejectedValueOnce(error(404))
    vi.mocked(getPurchaseFunctions).mockRejectedValueOnce(error(503))
    await flow.pay()
    expect(flow.canRestart.value).toBe(true)
    expect(flow.error.value).toContain('No se pudo')
    expect(flow.movie.value).toBeNull()
    await flow.restart()
    expect(flow.movie.value?.id).toBe(2)
    expect(flow.functions.value).toEqual([context])
  })
  it('ignores a rejection reload that completes after another movie was opened', async () => {
    await ready()
    let resolve!: (value: never) => void
    vi.mocked(confirmPurchase).mockRejectedValueOnce(error(404))
    vi.mocked(getPurchaseFunctions).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const payment = flow.pay()
    await flushPromises()
    expect(flow.loading.value).toBe(true)
    await flow.load(3)
    resolve({ movie: { id: 2 }, functions: [] } as never)
    await payment
    expect(flow.canRestart.value).toBe(false)
    expect(flow.error.value).toBe('')
    expect(flow.loading.value).toBe(false)
  })
})
