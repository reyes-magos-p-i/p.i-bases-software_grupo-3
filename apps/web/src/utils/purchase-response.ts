import type { GuestPurchaseReceipt, PurchaseReceipt } from '@/types/purchase'
import { validEmail } from './user-validation'
import { validGuestPurchaseCode } from './guest-purchase-code'

export class PurchaseResponseError extends Error {
  constructor() {
    super('No se pudo comprobar la respuesta de la compra. Intenta nuevamente.')
    this.name = 'PurchaseResponseError'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const category = (value: unknown) => ['GENERAL', 'CHILD', 'SENIOR'].includes(String(value))
export function validPurchaseFunction(value: unknown) {
  return (
    isRecord(value) &&
    positiveId(value.id) &&
    typeof value.title === 'string' &&
    typeof value.branchName === 'string' &&
    positiveId(value.theaterId) &&
    date(value.startsAt) &&
    ['2D', '3D'].includes(String(value.format)) &&
    ['STANDARD', 'IMAX', '70MM'].includes(String(value.technology)) &&
    typeof value.isPremiere === 'boolean'
  )
}
function validLine(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.label === 'string' &&
    positiveId(value.quantity) &&
    money(value.unitPrice) &&
    money(value.subtotal)
  )
}
export function validPurchaseLines(value: unknown): boolean {
  return Array.isArray(value) && value.every(validLine)
}
function validTicket(value: unknown) {
  return (
    isRecord(value) &&
    positiveId(value.id) &&
    positiveId(value.rowNumber) &&
    positiveId(value.columnNumber) &&
    positiveId(value.functionId) &&
    positiveId(value.theaterId) &&
    typeof value.title === 'string' &&
    date(value.startsAt) &&
    typeof value.functionStatus === 'string' &&
    category(value.category) &&
    money(value.unitPrice)
  )
}
function validHeader(value: Record<string, unknown>) {
  return (
    positiveId(value.id) &&
    value.reference === `ORD-${String(value.id).padStart(6, '0')}` &&
    date(value.purchasedAt) &&
    ['PAID', 'CANCELLED'].includes(String(value.status)) &&
    typeof value.buyerEmail === 'string' &&
    validEmail(value.buyerEmail) &&
    money(value.total)
  )
}
export function readPurchaseReceipt(value: unknown, requireTickets = false): PurchaseReceipt {
  if (
    !isRecord(value) ||
    !validHeader(value) ||
    !validPurchaseFunction(value.function) ||
    !validPurchaseLines(value.lines) ||
    !Array.isArray(value.tickets) ||
    !value.tickets.every(validTicket) ||
    (requireTickets && value.tickets.length === 0)
  )
    throw new PurchaseResponseError()
  return value as unknown as PurchaseReceipt
}
export function readGuestPurchaseReceipt(value: unknown): GuestPurchaseReceipt {
  const receipt = readPurchaseReceipt(value, true)
  if (
    !isRecord(value) ||
    typeof value.accessCode !== 'string' ||
    !validGuestPurchaseCode(value.accessCode)
  )
    throw new PurchaseResponseError()
  return { ...receipt, accessCode: value.accessCode }
}
