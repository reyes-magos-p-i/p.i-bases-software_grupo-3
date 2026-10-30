// A transaction is an invoice; the list only has paid and cancelled ones.
// Dates come as "YYYY-MM-DDTHH:mm" in Costa Rica time.
export type TransactionStatus = 'PAID' | 'CANCELLED'

export interface TransactionListItem {
  id: number
  purchasedAt: string
  clientName: string
  clientEmail: string
  movieTitle: string
  branchName: string | null
  theaterId: number
  functionStart: string
  tickets: number
  total: number
  status: TransactionStatus
}

export interface TransactionListResult {
  items: TransactionListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type TransactionPageSize = 10 | 20 | 50

export interface TransactionListQuery {
  search?: string
  branchId?: number
  movieId?: number
  status?: TransactionStatus
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: TransactionPageSize
}

export interface TransactionLine {
  productId: number
  name: string
  type: 'TICKET' | 'FOOD'
  quantity: number
  unitPrice: number
  subtotal: number
}

// Card payments keep only the brand Stripe returns (e.g. "visa") and the last 4 digits.
export interface TransactionDetail extends TransactionListItem {
  paymentMethod: 'CARD' | 'CASH'
  cardBrand: string | null
  cardLast4: string | null
  lines: TransactionLine[]
}

export interface TransactionFilterOptions {
  branches: { id: number; name: string | null }[]
  movies: { id: number; title: string }[]
}
