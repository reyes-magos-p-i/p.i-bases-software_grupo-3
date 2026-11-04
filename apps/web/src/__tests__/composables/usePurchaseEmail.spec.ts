import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { usePurchaseEmail } from '@/composables/usePurchaseEmail'
import type { GuestPurchaseReceipt, PurchaseReceipt, TicketEmailStatus } from '@/types/purchase'
import { getTicketEmailStatus, resendPurchaseTickets } from '@/services/purchase.service'
import {
  getGuestTicketEmailStatus,
  resendGuestPurchaseTickets,
} from '@/services/guest-purchase.service'
const session = vi.hoisted(() => ({ current: true }))
vi.mock('@/services/client-session.service', () => ({
  trackClientSession: () => () => session.current,
}))
vi.mock('@/services/purchase.service', () => ({
  getTicketEmailStatus: vi.fn(),
  resendPurchaseTickets: vi.fn(),
  purchaseError: () => 'No se pudo solicitar el envío.',
}))
vi.mock('@/services/guest-purchase.service', () => ({
  getGuestTicketEmailStatus: vi.fn(),
  resendGuestPurchaseTickets: vi.fn(),
}))

describe('Purchase email coordination', () => {
  let scope: ReturnType<typeof effectScope>
  const receipt = ref<PurchaseReceipt | null>(null),
    guest = ref<GuestPurchaseReceipt | null>(null),
    notify = vi.fn()
  const state = (status: TicketEmailStatus['status'], retryAfter = 0): TicketEmailStatus => ({
    status,
    recipient: 'client@example.com',
    sentAt: null,
    retryAfter,
  })
  const start = () => {
    scope = effectScope()
    return scope.run(() => usePurchaseEmail(receipt, guest, notify))!
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    session.current = true
    receipt.value = null
    guest.value = null
    vi.mocked(getTicketEmailStatus).mockResolvedValue(state('SENT'))
    vi.mocked(getGuestTicketEmailStatus).mockResolvedValue(state('SENT'))
  })
  afterEach(() => {
    scope?.stop()
    vi.useRealTimers()
  })
  it('does not query before a purchase is confirmed and polls only its pending initial email', async () => {
    const flow = start()
    expect(getTicketEmailStatus).not.toHaveBeenCalled()
    vi.mocked(getTicketEmailStatus)
      .mockResolvedValueOnce(state('PENDING'))
      .mockResolvedValueOnce(state('SENDING'))
      .mockResolvedValueOnce(state('SENT'))
    receipt.value = { id: 12 } as PurchaseReceipt
    await nextTick()
    await flushPromises()
    expect(flow.status.value?.status).toBe('PENDING')
    await vi.advanceTimersByTimeAsync(4000)
    expect(flow.status.value?.status).toBe('SENT')
    expect(getTicketEmailStatus).toHaveBeenCalledTimes(3)
    expect(resendPurchaseTickets).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
  it('sends the guest credential to guest endpoints and reports a completed manual resend', async () => {
    receipt.value = { id: 12 } as PurchaseReceipt
    guest.value = { ...receipt.value, accessCode: 'private' } as GuestPurchaseReceipt
    const flow = start()
    await flushPromises()
    vi.mocked(resendGuestPurchaseTickets).mockResolvedValueOnce(state('PENDING', 2))
    await flow.resend()
    expect(resendGuestPurchaseTickets).toHaveBeenCalledWith('private', expect.any(AbortSignal))
    expect(resendPurchaseTickets).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(flow.seconds.value).toBe(0)
    expect(notify).toHaveBeenCalledWith(
      'Los boletos fueron reenviados a tu correo electrónico.',
      false,
    )
  })
  it.each(['FAILED', 'UNKNOWN'] as const)(
    'stops after %s and reports a manual failure without retrying SMTP',
    async (status) => {
      receipt.value = { id: 12 } as PurchaseReceipt
      const flow = start()
      await flushPromises()
      vi.mocked(resendPurchaseTickets).mockResolvedValueOnce(state(status))
      await flow.resend()
      expect(flow.status.value?.status).toBe(status)
      expect(notify).toHaveBeenCalledWith(expect.any(String), true)
      await vi.advanceTimersByTimeAsync(10000)
      expect(resendPurchaseTickets).toHaveBeenCalledTimes(1)
    },
  )
  it('checks the result after an uncertain resend without submitting another resend', async () => {
    receipt.value = { id: 12 } as PurchaseReceipt
    const flow = start()
    await flushPromises()
    vi.mocked(resendPurchaseTickets).mockRejectedValueOnce(new Error('timeout'))
    await flow.resend()
    expect(notify).toHaveBeenCalledWith('No se pudo solicitar el envío.', true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(getTicketEmailStatus).toHaveBeenCalledTimes(2)
    expect(resendPurchaseTickets).toHaveBeenCalledTimes(1)
  })
  it('keeps the receipt and allows checking again when status lookup fails', async () => {
    receipt.value = { id: 12 } as PurchaseReceipt
    vi.mocked(getTicketEmailStatus).mockRejectedValueOnce(new Error('offline'))
    const flow = start()
    await flushPromises()
    expect(flow.error.value).toContain('Tus boletos siguen disponibles')
    expect(receipt.value?.id).toBe(12)
    await flow.check()
    expect(flow.status.value?.status).toBe('SENT')
    expect(flow.error.value).toBe('')
  })
  it('ignores a late response after the purchase changes and cancels its request', async () => {
    let resolve!: (value: TicketEmailStatus) => void
    vi.mocked(getTicketEmailStatus).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    receipt.value = { id: 12 } as PurchaseReceipt
    const flow = start()
    const signal = vi.mocked(getTicketEmailStatus).mock.calls[0]![1]!
    await flow.check()
    expect(getTicketEmailStatus).toHaveBeenCalledTimes(1)
    receipt.value = { id: 13 } as PurchaseReceipt
    await nextTick()
    await flushPromises()
    resolve(state('FAILED'))
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(flow.status.value?.status).toBe('SENT')
    expect(notify).not.toHaveBeenCalled()
  })
  it('ignores authenticated results and new actions after the client session changes', async () => {
    let resolve!: (value: TicketEmailStatus) => void
    vi.mocked(getTicketEmailStatus).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    receipt.value = { id: 12 } as PurchaseReceipt
    const flow = start()
    session.current = false
    resolve(state('SENT'))
    await flushPromises()
    await flow.resend()
    expect(flow.status.value).toBeNull()
    expect(resendPurchaseTickets).not.toHaveBeenCalled()
  })
  it('bounds polling and does not leave timers active after leaving the page', async () => {
    receipt.value = { id: 12 } as PurchaseReceipt
    vi.mocked(getTicketEmailStatus).mockResolvedValue(state('PENDING', 60))
    const flow = start()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(70000)
    expect(getTicketEmailStatus).toHaveBeenCalledTimes(31)
    expect(flow.status.value?.status).toBe('PENDING')
    scope.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(getTicketEmailStatus).toHaveBeenCalledTimes(31)
  })
})
