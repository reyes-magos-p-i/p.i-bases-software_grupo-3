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
import {
  getGuestPurchaseFunctions,
  getGuestPurchaseSeats,
  quoteGuestPurchase,
  confirmGuestPurchase,
  identifyGuestBuyer,
} from '@/services/guest-purchase.service'
import {
  clearPurchaseAttempt,
  loadPurchaseAttempt,
  savePurchaseAttempt,
  PurchaseAttemptStorageError,
} from '@/services/purchase-attempt.service'
import { authErrorStatus } from '@/utils/auth-errors'
import { validEmail } from '@/utils/user-validation'
import type { Seat } from '@/types/seats'
import type {
  GuestBuyer,
  GuestPurchaseReceipt,
  PendingPurchaseAttempt,
  PurchaseMovie,
  PurchaseFunction,
  SeatAvailability,
  PurchaseQuote,
  PurchaseReceipt,
  PurchaseSelection,
  TicketCategory,
} from '@/types/purchase'

const ACCOUNT_CONFLICTS = new Set([
  'CLIENT_LOGIN_REQUIRED',
  'CLIENT_ACCOUNT_INACTIVE',
  'CLIENT_VERIFICATION_REQUIRED',
])
const DEFINITIVE_CONFLICTS = new Set([
  'QUOTE_CHANGED',
  'SEATS_UNAVAILABLE',
  'FUNCTION_UNAVAILABLE',
  'TICKET_LIMIT_REACHED',
  'GUEST_EMAIL_LIMIT',
  ...ACCOUNT_CONFLICTS,
])
function errorCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code
}
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
    notice = ref(''),
    restored = ref(false),
    restartable = ref(false)
  const guest = ref(!localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)),
    guestBuyer = ref<GuestBuyer | null>(null),
    buyerError = ref(''),
    loginRequired = ref(false)
  const summaryStep = computed(() => (guest.value ? 4 : 3)),
    finalStep = computed(() => summaryStep.value + 1)
  const labels = computed(() =>
    guest.value
      ? ['Función', 'Asientos', 'Correo', 'Resumen', 'Compra lista']
      : ['Función', 'Asientos', 'Resumen', 'Compra lista'],
  )
  let generation = 0,
    disposed = false,
    currentMovieId = 0,
    requestKey = '',
    clientId = clientSession.user.value?.id
  let request: AbortController | undefined,
    refreshRequest: AbortController | undefined,
    poll: ReturnType<typeof setInterval> | undefined
  let paymentSerial: number | null = null,
    attempt: PendingPurchaseAttempt | null = null
  const api = () =>
    guest.value
      ? {
          functions: getGuestPurchaseFunctions,
          seats: getGuestPurchaseSeats,
          quote: quoteGuestPurchase,
        }
      : { functions: getPurchaseFunctions, seats: getPurchaseSeats, quote: quotePurchase }
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
  const locked = () => paymentSerial !== null || uncertain.value || attempt !== null
  const canRestart = computed(
    () => restartable.value && !busy.value && !loading.value && !uncertain.value && !receipt.value,
  )
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
  function beginRead() {
    request?.abort()
    refreshRequest?.abort()
    const serial = ++generation,
      controller = new AbortController(),
      current = session()
    request = controller
    return {
      serial,
      controller,
      active: () => serial === generation && current() && !controller.signal.aborted,
    }
  }
  function failed(failure: unknown) {
    error.value =
      failure instanceof PurchaseAttemptStorageError ? failure.message : purchaseError(failure)
    if (!guest.value && authErrorStatus(failure) === 401) onExpired()
  }
  function invalidate() {
    quote.value = null
    requestKey = ''
  }
  function releaseAttempt() {
    clearPurchaseAttempt(attempt?.requestKey ?? requestKey)
    attempt = null
    uncertain.value = false
    restored.value = false
  }
  function setSelection(seats: Seat[]) {
    if (busy.value || locked()) return
    const before = JSON.stringify(selection.value.seats)
    selected.value = seats
    if (before !== JSON.stringify(selection.value.seats)) invalidate()
  }
  function setCategory(position: number, category: TicketCategory) {
    if (busy.value || locked()) return
    categories.value = { ...categories.value, [position]: category }
    invalidate()
  }
  function recoverAttempt(): boolean {
    try {
      const saved = loadPurchaseAttempt()
      if (!saved) return false
      if (saved.buyer.kind === 'client' && saved.buyer.clientId !== clientSession.user.value?.id) {
        if (!localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY) || clientSession.user.value)
          clearPurchaseAttempt(saved.requestKey)
        return false
      }
      attempt = saved
      guest.value = saved.buyer.kind === 'guest'
      guestBuyer.value =
        saved.buyer.kind === 'guest'
          ? { email: saved.buyer.email, confirmEmail: saved.buyer.confirmEmail }
          : null
      quote.value = saved.quote
      requestKey = saved.requestKey
      currentMovieId = saved.quote.function.movieId
      movie.value = {
        id: currentMovieId,
        title: saved.quote.function.title,
        synopsis: saved.quote.function.synopsis,
        posterImage: saved.quote.function.posterImage,
      }
      availability.value = {
        function: saved.quote.function,
        seats: saved.quote.seats,
        categories: [],
      }
      selected.value = saved.quote.seats
      categories.value = Object.fromEntries(
        saved.quote.seats.map((seat) => [seat.positionId, seat.category]),
      )
      uncertain.value = true
      restored.value = true
      step.value = summaryStep.value
      return true
    } catch (error_) {
      failed(error_)
      restartable.value = error_ instanceof PurchaseAttemptStorageError && error_.discarded
      return true
    }
  }
  async function load(movieId: number) {
    if (locked()) {
      notice.value = 'Comprueba el resultado de la compra pendiente antes de iniciar otra.'
      return
    }
    currentMovieId = movieId
    if (recoverAttempt()) return
    const operation = beginRead()
    loading.value = true
    busy.value = false
    error.value = ''
    notice.value = ''
    movie.value = null
    functions.value = []
    availability.value = null
    selected.value = []
    receipt.value = null
    step.value = 1
    guestBuyer.value = null
    buyerError.value = ''
    loginRequired.value = false
    restartable.value = false
    invalidate()
    try {
      const result = await api().functions(movieId, operation.controller.signal)
      if (operation.active()) {
        movie.value = result.movie
        functions.value = result.functions
      }
    } catch (error_) {
      if (operation.active()) failed(error_)
    } finally {
      if (operation.serial === generation) loading.value = false
    }
  }
  async function chooseFunction(id: number) {
    if (busy.value || locked()) return
    const operation = beginRead()
    restartable.value = false
    loading.value = true
    error.value = ''
    availability.value = null
    selected.value = []
    categories.value = {}
    invalidate()
    try {
      const data = await api().seats(id, operation.controller.signal)
      if (operation.active()) {
        availability.value = data
        step.value = 2
      }
    } catch (error_) {
      if (operation.active()) failed(error_)
    } finally {
      if (operation.serial === generation) loading.value = false
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
      refreshRequest ||
      busy.value ||
      locked() ||
      receipt.value ||
      document.visibilityState === 'hidden'
    )
      return
    const current = session(),
      serial = generation,
      controller = new AbortController()
    refreshRequest = controller
    try {
      const data = await api().seats(id, controller.signal)
      if (
        current() &&
        serial === generation &&
        !controller.signal.aborted &&
        !busy.value &&
        !locked()
      )
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
      if (refreshRequest === controller) refreshRequest = undefined
    }
  }
  async function summarize() {
    if (busy.value || locked()) return
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
    if (busy.value || locked() || !guest.value) return
    const normalized = {
      email: buyer.email.trim().toLowerCase(),
      confirmEmail: buyer.confirmEmail.trim().toLowerCase(),
    }
    if (!validEmail(normalized.email) || normalized.email !== normalized.confirmEmail) {
      buyerError.value = 'Introduce un correo válido y confírmalo con la misma dirección.'
      return
    }
    const operation = beginRead()
    busy.value = true
    buyerError.value = ''
    loginRequired.value = false
    let accepted = false
    try {
      await identifyGuestBuyer(normalized, operation.controller.signal)
      if (operation.active()) {
        guestBuyer.value = normalized
        accepted = true
      }
    } catch (error_) {
      if (operation.active()) {
        buyerError.value = purchaseError(error_)
        loginRequired.value = errorCode(error_) === 'CLIENT_LOGIN_REQUIRED'
      }
    } finally {
      if (operation.serial === generation) busy.value = false
    }
    if (accepted) await review()
  }
  async function review() {
    const operation = beginRead()
    busy.value = true
    error.value = ''
    try {
      const result = await api().quote(selection.value, operation.controller.signal)
      if (operation.active()) {
        quote.value = result
        requestKey = crypto.randomUUID()
        step.value = summaryStep.value
      }
    } catch (error_) {
      if (operation.active()) {
        failed(error_)
        step.value = 2
      }
    } finally {
      if (operation.serial === generation) busy.value = false
    }
  }
  function prepareAttempt(): PendingPurchaseAttempt | null {
    if (attempt) return attempt
    const buyer =
      guest.value && guestBuyer.value
        ? { kind: 'guest' as const, ...guestBuyer.value }
        : { kind: 'client' as const, clientId: clientSession.user.value?.id ?? 0 }
    try {
      attempt = savePurchaseAttempt({
        version: 1,
        buyer,
        requestKey,
        quote: quote.value!,
        selection: selection.value,
      })
      return attempt
    } catch (error_) {
      failed(error_)
      return null
    }
  }
  async function pay() {
    if (!quote.value || busy.value || receipt.value || (guest.value && !guestBuyer.value)) return
    const pending = prepareAttempt()
    if (!pending) return
    request?.abort()
    refreshRequest?.abort()
    const serial = ++generation,
      current = session(),
      wasUncertain = uncertain.value
    busy.value = true
    uncertain.value = true
    paymentSerial = serial
    error.value = ''
    try {
      const data = {
        ...pending.selection,
        requestKey: pending.requestKey,
        quoteVersion: pending.quote.version,
      }
      const result =
        pending.buyer.kind === 'guest'
          ? await confirmGuestPurchase({
              ...data,
              email: pending.buyer.email,
              confirmEmail: pending.buyer.confirmEmail,
            })
          : await confirmPurchase(data)
      if (current() && serial === generation) {
        receipt.value = result
        releaseAttempt()
        notice.value = ''
        step.value = finalStep.value
      }
    } catch (error_) {
      if (current() && serial === generation) await paymentFailed(error_, wasUncertain)
    } finally {
      if (serial === generation) {
        busy.value = false
        paymentSerial = null
        adoptClient()
      }
    }
  }
  async function paymentFailed(failure: unknown, wasUncertain: boolean) {
    failed(failure)
    const status = authErrorStatus(failure),
      code = errorCode(failure)
    const definite = status === 404 || (status === 409 && DEFINITIVE_CONFLICTS.has(code ?? ''))
    uncertain.value =
      !definite && (wasUncertain || !status || status >= 500 || code === 'PURCHASE_BUSY')
    if (uncertain.value) {
      error.value += guest.value
        ? ' Reintenta el pago de esta misma selección para recuperar tu compra sin duplicarla. Conservaremos la selección mientras comprobamos el resultado.'
        : ' Puedes reintentar el pago de esta misma selección; la compra no se duplicará. También puedes consultar «Historial de compras».'
      return
    }
    const wasRestored = restored.value
    releaseAttempt()
    restartable.value = true
    if (status === 404 || wasRestored) {
      await reloadRejectedPurchase()
      return
    }
    if (ACCOUNT_CONFLICTS.has(code ?? '')) {
      loginRequired.value = code === 'CLIENT_LOGIN_REQUIRED'
      buyerError.value = purchaseError(failure)
      error.value = ''
      step.value = 3
      invalidate()
    } else if (status === 409) {
      invalidate()
      step.value = 2
      busy.value = false
      // The failed transaction has finished; refresh is now safe.
      paymentSerial = null
      await refresh()
    }
  }
  async function reloadRejectedPurchase() {
    busy.value = false
    paymentSerial = null
    const rejection = error.value
    const pending = load(currentMovieId)
    const serial = generation
    await pending
    if (disposed || serial !== generation) return
    error.value =
      error.value && error.value !== rejection ? `${rejection} ${error.value}` : rejection
    restartable.value = true
    adoptClient()
  }
  async function restart() {
    if (!canRestart.value || locked()) return
    await load(currentMovieId)
  }
  function back() {
    if (!busy.value && !locked()) step.value = Math.max(1, step.value - 1)
  }
  function resetOperations() {
    generation++
    request?.abort()
    refreshRequest?.abort()
    loading.value = false
    busy.value = false
    paymentSerial = null
  }
  function adoptClient() {
    if (
      !guest.value ||
      clientSession.status.value !== 'authenticated' ||
      !clientSession.user.value ||
      locked() ||
      receipt.value
    )
      return
    resetOperations()
    guest.value = false
    clientId = clientSession.user.value.id
    guestBuyer.value = null
    buyerError.value = ''
    loginRequired.value = false
    invalidate()
    step.value = availability.value ? 2 : 1
    if (selected.value.length) void review()
    else if (!movie.value && currentMovieId) void load(currentMovieId)
  }
  function clearPrivateState() {
    resetOperations()
    releaseAttempt()
    movie.value = null
    functions.value = []
    availability.value = null
    selected.value = []
    invalidate()
    receipt.value = null
    restartable.value = false
  }
  const stop = watch(
    () => [clientSession.status.value, clientSession.user.value?.id] as const,
    ([status, id]) => {
      if (guest.value) {
        adoptClient()
        return
      }
      if (status === 'anonymous') {
        clearPrivateState()
        onExpired()
      } else if (status === 'authenticated' && id !== clientId) {
        clearPrivateState()
        clientId = id
        if (currentMovieId) void load(currentMovieId)
      }
    },
  )
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
    refreshRequest?.abort()
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
    restored,
    canRestart,
    restart,
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
