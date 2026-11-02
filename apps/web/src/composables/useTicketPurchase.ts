import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getPurchaseFunctions,
  getPurchaseSeats,
  quotePurchase,
  confirmPurchase,
  purchaseError,
} from '@/services/purchase.service'
import {
  CLIENT_ACCESS_TOKEN_KEY,
  clientSession,
  clientSessionRevision,
} from '@/services/client-session.service'
import { authErrorStatus } from '@/utils/auth-errors'
import type { Seat } from '@/types/seats'
import type {
  PurchaseMovie,
  PurchaseFunction,
  SeatAvailability,
  PurchaseQuote,
  PurchaseReceipt,
  PurchaseSelection,
  TicketCategory,
} from '@/types/purchase'
export function useTicketPurchase(onExpired: () => void) {
  const movie = ref<PurchaseMovie | null>(null),
    functions = ref<PurchaseFunction[]>([]),
    availability = ref<SeatAvailability | null>(null)
  const selected = ref<Seat[]>([]),
    categories = ref<Record<number, TicketCategory>>({}),
    quote = ref<PurchaseQuote | null>(null),
    receipt = ref<PurchaseReceipt | null>(null)
  const step = ref(1),
    loading = ref(false),
    busy = ref(false),
    uncertain = ref(false),
    error = ref(''),
    notice = ref('')
  let generation = 0,
    disposed = false,
    request: AbortController | undefined,
    poll: ReturnType<typeof setInterval> | undefined,
    refreshing = false,
    requestKey = ''
  const selection = computed<PurchaseSelection>(() => {
    const seats: PurchaseSelection['seats'] = { GENERAL: [], CHILD: [], SENIOR: [] }
    const context = availability.value?.function
    if (context)
      for (const seat of selected.value) {
        const position = (seat.rowNumber - 1) * context.columns + seat.columnNumber
        seats[categories.value[position] ?? 'GENERAL'].push(position)
      }
    return { functionId: context?.id ?? 0, seats }
  })
  function session() {
    const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY),
      revision = clientSessionRevision()
    return () =>
      !disposed &&
      !!token &&
      token === localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY) &&
      revision === clientSessionRevision()
  }
  function failed(error_: unknown) {
    error.value = purchaseError(error_)
    if (authErrorStatus(error_) === 401) onExpired()
  }
  function invalidate() {
    quote.value = null
    requestKey = ''
  }
  function setSelection(seats: Seat[]) {
    if (busy.value || uncertain.value) return
    const before = JSON.stringify(selection.value.seats)
    selected.value = seats
    if (before !== JSON.stringify(selection.value.seats)) invalidate()
  }
  function setCategory(position: number, category: TicketCategory) {
    if (busy.value || uncertain.value) return
    categories.value = { ...categories.value, [position]: category }
    invalidate()
  }
  async function load(movieId: number) {
    const current = session(),
      serial = ++generation
    request?.abort()
    const controller = new AbortController()
    request = controller
    loading.value = true
    error.value = ''
    movie.value = null
    functions.value = []
    availability.value = null
    selected.value = []
    receipt.value = null
    uncertain.value = false
    step.value = 1
    invalidate()
    try {
      const result = await getPurchaseFunctions(movieId, controller.signal)
      if (current() && serial === generation) {
        movie.value = result.movie
        functions.value = result.functions
      }
    } catch (error_) {
      if (current() && !controller.signal.aborted && serial === generation) failed(error_)
    } finally {
      if (serial === generation) loading.value = false
    }
  }
  async function chooseFunction(id: number) {
    if (busy.value || uncertain.value) return
    const current = session(),
      serial = ++generation
    request?.abort()
    const controller = new AbortController()
    request = controller
    loading.value = true
    error.value = ''
    availability.value = null
    selected.value = []
    categories.value = {}
    invalidate()
    try {
      const data = await getPurchaseSeats(id, controller.signal)
      if (current() && serial === generation) {
        availability.value = data
        step.value = 2
      }
    } catch (error_) {
      if (current() && !controller.signal.aborted && serial === generation) failed(error_)
    } finally {
      if (serial === generation) loading.value = false
    }
  }
  function applyAvailability(data: SeatAvailability) {
    const free = new Set(
      data.seats.filter((seat) => seat.state === 'free').map((seat) => seat.positionId),
    )
    const remaining = selected.value.filter((seat) =>
      free.has((seat.rowNumber - 1) * data.function.columns + seat.columnNumber),
    )
    if (remaining.length !== selected.value.length) {
      selected.value = remaining
      step.value = 2
      invalidate()
      notice.value =
        'La disponibilidad cambió. Revisa los asientos seleccionados antes de continuar.'
    }
    availability.value = data
  }
  async function refresh() {
    const id = availability.value?.function.id
    if (
      !id ||
      refreshing ||
      busy.value ||
      uncertain.value ||
      receipt.value ||
      document.visibilityState === 'hidden'
    )
      return
    refreshing = true
    const current = session(),
      serial = generation
    const controller = new AbortController()
    request = controller
    try {
      const data = await getPurchaseSeats(id, controller.signal)
      if (!current() || serial !== generation || busy.value) return
      applyAvailability(data)
    } catch (error_) {
      if (current() && serial === generation && !controller.signal.aborted) {
        if (authErrorStatus(error_) === 409) {
          step.value = 1
          availability.value = null
          selected.value = []
          invalidate()
        }
        failed(error_)
      }
    } finally {
      refreshing = false
    }
  }
  async function summarize() {
    if (busy.value || uncertain.value) return
    if (!selected.value.length) {
      error.value = 'Selecciona al menos un asiento para continuar.'
      return
    }
    request?.abort()
    const current = session(),
      serial = ++generation
    busy.value = true
    error.value = ''
    try {
      const result = await quotePurchase(selection.value)
      if (current() && serial === generation) {
        quote.value = result
        requestKey = crypto.randomUUID()
        step.value = 3
      }
    } catch (error_) {
      if (current() && serial === generation) {
        failed(error_)
        step.value = 2
      }
    } finally {
      busy.value = false
    }
  }
  async function pay() {
    if (!quote.value || busy.value) return
    request?.abort()
    const current = session(),
      serial = ++generation,
      wasUncertain = uncertain.value
    busy.value = true
    error.value = ''
    try {
      const result = await confirmPurchase({
        ...selection.value,
        requestKey,
        quoteVersion: quote.value.version,
      })
      if (current() && serial === generation) {
        receipt.value = result
        uncertain.value = false
        step.value = 4
      }
    } catch (error_) {
      if (!current() || serial !== generation) return
      failed(error_)
      const status = authErrorStatus(error_)
      uncertain.value = wasUncertain || !status || status >= 500
      if (uncertain.value) {
        error.value +=
          ' Puedes reintentar el pago de esta misma selección; la compra no se duplicará. También puedes consultar «Historial de compras».'
      } else if (status === 409) {
        uncertain.value = false
        invalidate()
        step.value = 2
        busy.value = false
        await refresh()
      }
    } finally {
      busy.value = false
    }
  }
  function back() {
    if (busy.value || uncertain.value) return
    step.value = Math.max(1, step.value - 1)
  }
  const stop = watch(clientSession.status, (status) => {
    if (status === 'anonymous') {
      generation++
      request?.abort()
      movie.value = null
      availability.value = null
      selected.value = []
      quote.value = null
      receipt.value = null
      onExpired()
    }
  })
  const focus = () => void refresh()
  onMounted(() => {
    poll = setInterval(focus, 10000)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
  })
  onBeforeUnmount(() => {
    disposed = true
    generation++
    request?.abort()
    clearInterval(poll)
    window.removeEventListener('focus', focus)
    document.removeEventListener('visibilitychange', focus)
    stop()
  })
  return {
    movie,
    functions,
    availability,
    selected,
    categories,
    quote,
    receipt,
    step,
    loading,
    busy,
    uncertain,
    error,
    notice,
    selection,
    load,
    chooseFunction,
    setSelection,
    setCategory,
    summarize,
    pay,
    back,
    refresh,
  }
}
