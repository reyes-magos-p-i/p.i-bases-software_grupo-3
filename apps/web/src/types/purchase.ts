import type { TransactionStatus } from './transaction'
import type { Seat } from './seats'
import type { PortalMovie } from './movie'
export type TicketCategory = 'GENERAL' | 'CHILD' | 'SENIOR'
export interface PricingSettings {
  format: '2D' | '3D'
  technology: 'STANDARD' | 'IMAX' | '70MM'
  isPremiere: boolean
}
export interface PurchaseFunction extends PricingSettings, Omit<PurchaseMovie, 'id'> {
  id: number
  movieId: number
  branchId: number
  branchName: string
  theaterId: number
  rows: number
  columns: number
  startsAt: string
  endsAt: string
  status: string
  available: boolean
  price: number
}
export interface PurchaseSeat extends Seat {
  positionId: number
}
export type SeatSelection = Record<TicketCategory, number[]>
export interface PurchaseSelection {
  functionId: number
  seats: SeatSelection
}
export interface PurchaseLine {
  code: string
  category: TicketCategory
  label: string
  vip: boolean
  quantity: number
  base: number
  modifiers: { label: string; amount: number }[]
  unitPrice: number
  subtotal: number
}
export interface PurchaseQuote {
  function: PurchaseFunction
  seats: (PurchaseSeat & { category: TicketCategory })[]
  lines: PurchaseLine[]
  total: number
  quantity: number
  version: string
}
export interface PurchasedTicket
  extends
    Pick<PurchaseSeat, 'rowNumber' | 'columnNumber' | 'theaterId'>,
    Pick<PurchaseFunction, 'title' | 'startsAt'> {
  id: number
  functionId: number
  functionStatus: string
  branchName: string
  unitPrice: number
  category: TicketCategory
}
export interface PurchaseReceipt extends Omit<PurchaseQuote, 'seats' | 'quantity' | 'version'> {
  id: number
  reference: string
  purchasedAt: string
  qrPayload: string
  status: string
  buyerEmail: string
  paymentMethod: 'CARD' | 'CASH' | 'SIMULATED'
  cardBrand: string | null
  cardLast4: string | null
  tickets: PurchasedTicket[]
}
export interface GuestBuyer {
  email: string
  confirmEmail: string
}
export interface GuestPurchaseReceipt extends PurchaseReceipt {
  accessCode: string
}
export interface TicketEmailStatus {
  status: 'NOT_REQUESTED' | 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN'
  recipient: string | null
  sentAt: string | null
  retryAfter: number
}
export interface PendingPurchaseAttempt {
  version: 1
  requestKey: string
  quote: PurchaseQuote
  selection: PurchaseSelection
  buyer: { kind: 'client'; clientId: number } | ({ kind: 'guest' } & GuestBuyer)
}
export interface PurchaseCategory {
  code: TicketCategory
  label: string
  description: string
  base: number
}
export interface SeatAvailability {
  function: PurchaseFunction
  seats: PurchaseSeat[]
  categories: PurchaseCategory[]
}
export interface PurchaseMovie extends PortalMovie {
  synopsis: string
}
export interface PurchaseListQuery {
  page?: number
  search?: string
  dateFrom?: string
  dateTo?: string
}
export interface PurchaseList {
  items: {
    id: number
    reference: string
    purchasedAt: string
    status: TransactionStatus
    total: number
    title: string
    startsAt: string
    quantity: number
  }[]
  page: number
  total: number
  totalPages: number
}
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  GENERAL: 'General',
  CHILD: 'Niño',
  SENIOR: 'Adulto mayor',
}
