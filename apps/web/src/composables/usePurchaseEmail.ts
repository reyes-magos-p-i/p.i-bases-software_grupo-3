import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { GuestPurchaseReceipt, PurchaseReceipt, TicketEmailStatus } from '@/types/purchase'
import {
  getTicketEmailStatus,
  purchaseError,
  resendPurchaseTickets,
} from '@/services/purchase.service'
import {
  getGuestTicketEmailStatus,
  resendGuestPurchaseTickets,
} from '@/services/guest-purchase.service'
import { trackClientSession } from '@/services/client-session.service'

function request(resend: boolean, id: number, code: string | undefined, signal: AbortSignal) {
  if (code) return (resend ? resendGuestPurchaseTickets : getGuestTicketEmailStatus)(code, signal)
  return (resend ? resendPurchaseTickets : getTicketEmailStatus)(id, signal)
}

export function usePurchaseEmail(
  receipt: Ref<PurchaseReceipt | null>,
  guest: Ref<GuestPurchaseReceipt | null>,
  notify: (message: string, error: boolean) => void,
) {
  const status = ref<TicketEmailStatus | null>(null),
    busy = ref(false),
    checking = ref(false),
    error = ref(''),
    seconds = ref(0)
  let revision = 0,
    controller: AbortController | undefined,
    poll: ReturnType<typeof setTimeout> | undefined,
    tick: ReturnType<typeof setInterval> | undefined
  let currentSession: () => boolean = () => true,
    rounds = 0,
    manual = false
  const waiting = computed(
    () => status.value?.status === 'PENDING' || status.value?.status === 'SENDING',
  )
  function current(ownRevision: number, signal: AbortSignal) {
    return ownRevision === revision && currentSession() && !signal.aborted
  }
  function schedule() {
    poll = setTimeout(() => {
      void execute()
    }, 2000)
  }
  function failedRequest(failure: unknown, resend: boolean) {
    if (!resend) {
      error.value =
        'No se pudo comprobar el envío. Tus boletos siguen disponibles; puedes consultar el estado nuevamente.'
      return
    }
    manual = false
    notify(purchaseError(failure), true)
    // A timed-out request may already be queued. Check its result instead of sending again.
    schedule()
  }
  function clearTimers() {
    clearTimeout(poll)
    clearInterval(tick)
  }
  function accept(value: TicketEmailStatus) {
    status.value = value
    seconds.value = value.retryAfter
    clearInterval(tick)
    if (seconds.value)
      tick = setInterval(() => {
        if (--seconds.value <= 0) clearInterval(tick)
      }, 1000)
    if (manual && value.status === 'SENT') {
      manual = false
      notify('Los boletos fueron reenviados a tu correo electrónico.', false)
    }
    if (manual && (value.status === 'FAILED' || value.status === 'UNKNOWN')) {
      manual = false
      notify(
        value.status === 'FAILED'
          ? 'No se pudieron enviar los boletos por correo. Tu compra sigue registrada.'
          : 'No pudimos confirmar el envío. Revisa tu correo antes de solicitar otro.',
        true,
      )
    }
  }
  async function execute(resend = false) {
    const purchase = receipt.value
    if (!purchase || checking.value || busy.value || !currentSession()) return
    clearTimeout(poll)
    const ownRevision = revision,
      code = guest.value?.accessCode
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    if (resend) {
      busy.value = true
      manual = true
      rounds = 0
    } else checking.value = true
    error.value = ''
    try {
      const value = await request(resend, purchase.id, code, signal)
      if (!current(ownRevision, signal)) return
      accept(value)
      if (waiting.value && rounds++ < 30) schedule()
    } catch (error_) {
      if (current(ownRevision, signal)) failedRequest(error_, resend)
    } finally {
      if (ownRevision === revision) {
        busy.value = false
        checking.value = false
      }
    }
  }
  watch(
    () => [receipt.value?.id, guest.value?.accessCode],
    () => {
      revision++
      controller?.abort()
      clearTimers()
      status.value = null
      busy.value = false
      checking.value = false
      error.value = ''
      seconds.value = 0
      rounds = 0
      manual = false
      currentSession = guest.value ? () => true : trackClientSession()
      if (receipt.value) void execute()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    revision++
    controller?.abort()
    clearTimers()
  })
  return {
    status,
    busy,
    checking,
    error,
    seconds,
    check: () => {
      rounds = 0
      return execute()
    },
    resend: () => execute(true),
  }
}
