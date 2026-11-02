import type { PendingPurchaseAttempt, PurchaseQuote } from '@/types/purchase'
import {
  isRecord,
  positiveId,
  validPurchaseFunction,
  validPurchaseLines,
} from '@/utils/purchase-response'
import { validEmail } from '@/utils/user-validation'

const STORAGE_KEY = 'cinetadel.pending-purchase'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const categories = ['GENERAL', 'CHILD', 'SENIOR']

export class PurchaseAttemptStorageError extends Error {
  constructor(readonly discarded = false) {
    super(
      discarded
        ? 'No se pudo recuperar el intento anterior y se eliminó su información dañada. Si habías intentado pagar, comprueba el resultado de la compra antes de volver a empezar. Si necesitas ayuda, contacta con asistencia.'
        : 'No se pudo guardar o recuperar el intento de compra. Comprueba que tu navegador permite guardar datos. Si el problema persiste, contacta con asistencia.',
    )
    this.name = 'PurchaseAttemptStorageError'
  }
}
function validContext(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    positiveId(value.id) &&
    positiveId(value.movieId) &&
    typeof value.title === 'string' &&
    typeof value.branchName === 'string' &&
    positiveId(value.theaterId) &&
    positiveId(value.rows) &&
    positiveId(value.columns) &&
    value.rows * value.columns <= 10000 &&
    typeof value.startsAt === 'string'
  )
}
function validSeats(quote: Record<string, unknown>, context: Record<string, unknown>) {
  if (
    !Array.isArray(quote.seats) ||
    quote.seats.length !== quote.quantity ||
    quote.seats.length > 10000
  )
    return false
  const positions = new Set<number>()
  return quote.seats.every((seat) => {
    if (
      !isRecord(seat) ||
      !positiveId(seat.positionId) ||
      !positiveId(seat.rowNumber) ||
      !positiveId(seat.columnNumber)
    )
      return false
    const position = (seat.rowNumber - 1) * Number(context.columns) + seat.columnNumber
    if (
      seat.rowNumber > Number(context.rows) ||
      seat.columnNumber > Number(context.columns) ||
      seat.positionId !== position ||
      positions.has(position)
    )
      return false
    positions.add(position)
    return (
      seat.theaterId === context.theaterId &&
      categories.includes(String(seat.category)) &&
      ['normal', 'vip', 'accessibility'].includes(String(seat.type)) &&
      seat.state === 'free'
    )
  })
}
function validQuote(value: unknown): value is PurchaseQuote {
  if (
    !isRecord(value) ||
    !validContext(value.function) ||
    !validPurchaseFunction(value.function) ||
    !positiveId(value.quantity) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/iu.test(value.version) ||
    typeof value.total !== 'number' ||
    !Number.isFinite(value.total) ||
    value.total < 0 ||
    !validPurchaseLines(value.lines)
  )
    return false
  return validSeats(value, value.function)
}
function validBuyer(value: unknown): value is PendingPurchaseAttempt['buyer'] {
  if (!isRecord(value)) return false
  if (value.kind === 'client') return positiveId(value.clientId)
  return (
    value.kind === 'guest' &&
    typeof value.email === 'string' &&
    validEmail(value.email) &&
    value.confirmEmail === value.email
  )
}
function validAttempt(value: unknown): value is PendingPurchaseAttempt {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.requestKey === 'string' &&
    UUID.test(value.requestKey) &&
    validBuyer(value.buyer) &&
    validQuote(value.quote) &&
    matchingSelection(value.selection, value.quote)
  )
}
function matchingSelection(value: unknown, quote: PurchaseQuote): boolean {
  if (!isRecord(value) || value.functionId !== quote.function.id || !isRecord(value.seats))
    return false
  const seats = value.seats
  return categories.every((category) => {
    const positions: unknown = seats[category]
    const expected = quote.seats
      .filter((seat) => seat.category === category)
      .map((seat) => seat.positionId)
    return (
      Array.isArray(positions) &&
      positions.length === expected.length &&
      new Set(positions).size === positions.length &&
      positions.every((position) => expected.includes(position as number))
    )
  })
}
export function loadPurchaseAttempt(): PendingPurchaseAttempt | null {
  let stored: string | null
  try {
    stored = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    throw new PurchaseAttemptStorageError()
  }
  if (stored === null) return null
  try {
    const value: unknown = JSON.parse(stored)
    if (!validAttempt(value)) throw new PurchaseAttemptStorageError()
    return value
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      throw new PurchaseAttemptStorageError()
    }
    throw new PurchaseAttemptStorageError(true)
  }
}
export function savePurchaseAttempt(attempt: PendingPurchaseAttempt): PendingPurchaseAttempt {
  try {
    if (!validAttempt(attempt)) throw new PurchaseAttemptStorageError()
    const serialized = JSON.stringify(attempt)
    sessionStorage.setItem(STORAGE_KEY, serialized)
    return JSON.parse(serialized) as PendingPurchaseAttempt
  } catch {
    throw new PurchaseAttemptStorageError()
  }
}
export function clearPurchaseAttempt(requestKey: string): void {
  try {
    if (loadPurchaseAttempt()?.requestKey === requestKey) sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // A cleanup failure must not turn a confirmed purchase into an apparent payment failure.
  }
}
