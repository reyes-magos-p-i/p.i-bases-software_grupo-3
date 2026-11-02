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
import {
  getGuestPurchaseFunctions,
  getGuestPurchaseSeats,
  quoteGuestPurchase,
  confirmGuestPurchase,
  identifyGuestBuyer,
} from '@/services/guest-purchase.service'
import { validEmail } from '@/utils/user-validation'
import type { Seat } from '@/types/seats'
import type {
  GuestBuyer,
  GuestPurchaseReceipt,
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
  const guest = ref(!localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY))
  const guestBuyer = ref<GuestBuyer | null>(null),
    buyerError = ref(''),
    loginRequired = ref(false)
  const summaryStep = computed(() => (guest.value ? 4 : 3))
  const finalStep = computed(() => summaryStep.value + 1)
  const labels = computed(() =>
    guest.value
      ? ['Función', 'Asientos', 'Correo', 'Resumen', 'Compra lista']
      : ['Función', 'Asientos', 'Resumen', 'Compra lista'],
  )
  let paying = false
  const api = () =>
    guest.value
      ? {
          functions: getGuestPurchaseFunctions,
          seats: getGuestPurchaseSeats,
          quote: quoteGuestPurchase,
        }
      : { functions: getPurchaseFunctions, seats: getPurchaseSeats, quote: quotePurchase }
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
      (guest.value ||
        (!!token &&
          token === localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY) &&
          revision === clientSessionRevision()))
  }
  function failed(error_: unknown) {
    error.value = purchaseError(error_)
    if (!guest.value && authErrorStatus(error_) === 401) onExpired()
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
  let currentMovieId = 0
  async function load(movieId: number) {
    currentMovieId = movieId
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
    guestBuyer.value = null
    buyerError.value = ''
    loginRequired.value = false
    invalidate()
    try {
      const result = await api().functions(movieId, controller.signal)
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
      const data = await api().seats(id, controller.signal)
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
      const data = await api().seats(id, controller.signal)
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
    if (guest.value) {
      step.value = 3
      buyerError.value = ''
      loginRequired.value = false
      return
    }
    await review()
  }
  async function identify(buyer: GuestBuyer) {
    if (busy.value || uncertain.value || !guest.value) return
    const normalized = {
      email: buyer.email.trim().toLowerCase(),
      confirmEmail: buyer.confirmEmail.trim().toLowerCase(),
    }
    if (!validEmail(normalized.email) || normalized.email !== normalized.confirmEmail) {
      buyerError.value = 'Introduce un correo válido y confírmalo con la misma dirección.'
      return
    }
    const current = session(),
      serial = ++generation
    request?.abort()
    busy.value = true
    buyerError.value = ''
    loginRequired.value = false
    let accepted = false
    try {
      await identifyGuestBuyer(normalized)
      if (current() && serial === generation) {
        guestBuyer.value = normalized
        accepted = true
      }
    } catch (error_) {
      if (current() && serial === generation) {
        buyerError.value = purchaseError(error_)
        loginRequired.value = requiresLogin(error_)
      }
    } finally {
      if (serial === generation) busy.value = false
    }
    if (accepted) await review()
  }
  function requiresLogin(error_: unknown): boolean {
    return (
      (error_ as { response?: { data?: { code?: string } } } | null)?.response?.data?.code ===
      'CLIENT_LOGIN_REQUIRED'
    )
  }
  async function review() {
    request?.abort()
    const current = session(),
      serial = ++generation
    busy.value = true
    error.value = ''
    try {
      const result = await api().quote(selection.value)
      if (current() && serial === generation) {
        quote.value = result
        requestKey = crypto.randomUUID()
        step.value = summaryStep.value
      }
    } catch (error_) {
      if (current() && serial === generation) {
        failed(error_)
        step.value = 2
      }
    } finally {
      if (serial === generation) busy.value = false
    }
  }
  async function pay() {
    if (!quote.value || busy.value || (guest.value && !guestBuyer.value)) return
    request?.abort()
    const current = session(),
      serial = ++generation,
      wasUncertain = uncertain.value
    busy.value = true
    paying = true
    error.value = ''
    try {
      const data = {
        ...selection.value,
        requestKey,
        quoteVersion: quote.value.version,
      }
      const result =
        guest.value && guestBuyer.value
          ? await confirmGuestPurchase({ ...data, ...guestBuyer.value })
          : await confirmPurchase(data)
      if (current() && serial === generation) {
        receipt.value = result
        uncertain.value = false
        step.value = finalStep.value
      }
    } catch (error_) {
      if (!current() || serial !== generation) return
      await paymentFailed(error_, wasUncertain)
    } finally {
      busy.value = false
      paying = false
    }
  }
  async function paymentFailed(error_: unknown, wasUncertain: boolean) {
    failed(error_)
    const status = authErrorStatus(error_)
    uncertain.value = wasUncertain || !status || status >= 500
    if (uncertain.value) {
      error.value += guest.value
        ? ' Reintenta el pago de esta misma selección para recuperar tu compra sin duplicarla. Conservaremos la selección mientras comprobamos el resultado.'
        : ' Puedes reintentar el pago de esta misma selección; la compra no se duplicará. También puedes consultar «Mis compras».'
    } else if (requiresLogin(error_)) {
      loginRequired.value = true
      buyerError.value = purchaseError(error_)
      error.value = ''
      step.value = 3
      invalidate()
    } else if (status === 409) {
      uncertain.value = false
      invalidate()
      step.value = 2
      busy.value = false
      await refresh()
    }
  }
  function back() {
    if (busy.value || uncertain.value) return
    step.value = Math.max(1, step.value - 1)
  }
  const stop = watch(clientSession.status, (status) => {
    if (
      status === 'authenticated' &&
      guest.value &&
      !paying &&
      !uncertain.value &&
      !receipt.value
    ) {
      generation++
      request?.abort()
      guest.value = false
      loading.value = false
      busy.value = false
      guestBuyer.value = null
      buyerError.value = ''
      loginRequired.value = false
      invalidate()
      step.value = availability.value ? 2 : 1
      if (selected.value.length) void review()
      else if (!movie.value && currentMovieId) void load(currentMovieId)
    }
    if (status === 'anonymous' && !guest.value) {
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
    guest,
    guestBuyer,
    buyerError,
    loginRequired,
    summaryStep,
    finalStep,
    labels,
    identify,
    guestReceipt: computed(() =>
      receipt.value && 'accessCode' in receipt.value
        ? (receipt.value as GuestPurchaseReceipt)
        : null,
    ),
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
