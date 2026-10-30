// Formats of the transactions section, as the test plan writes them:
// FAC-000123, 12/10/2026, 12/10/2026 17:00 and ₡3500.
import type {
  TransactionDetail,
  TransactionListItem,
  TransactionStatus,
} from '@/types/transaction'

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
}

/** Invoice 123 → "FAC-000123". The client sees the same invoice as ORD-000123. */
export function formatTransactionId(id: number): string {
  return `FAC-${String(id).padStart(6, '0')}`
}

/** "2026-10-12T17:00" → "12/10/2026". */
export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** "2026-10-12T17:00" → "12/10/2026 17:00". */
export function formatDateTime(value: string): string {
  return `${formatDate(value)} ${value.slice(11, 16)}`
}

/** 3500 → "₡3500"; cents only when there are any: 3500.5 → "₡3500,50". */
export function formatColones(amount: number): string {
  return Number.isInteger(amount) ? `₡${amount}` : `₡${amount.toFixed(2).replace('.', ',')}`
}

const CARD_BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
}

/** "Tarjeta Visa terminada en 4242", or "Efectivo" for box office sales. */
export function formatPaymentMethod(
  transaction: Pick<TransactionDetail, 'paymentMethod' | 'cardBrand' | 'cardLast4'>,
): string {
  if (transaction.paymentMethod === 'CASH') return 'Efectivo'
  const brand = transaction.cardBrand
    ? (CARD_BRANDS[transaction.cardBrand.toLowerCase()] ??
      transaction.cardBrand.charAt(0).toUpperCase() + transaction.cardBrand.slice(1))
    : ''
  const card = brand ? `Tarjeta ${brand}` : 'Tarjeta'
  return transaction.cardLast4 ? `${card} terminada en ${transaction.cardLast4}` : card
}

/** "Ecos del Volcán – Sala 1, 12/10/2026 17:00" */
export function formatFunction(
  transaction: Pick<TransactionListItem, 'movieTitle' | 'theaterId' | 'functionStart'>,
): string {
  return `${transaction.movieTitle} – Sala ${transaction.theaterId}, ${formatDateTime(transaction.functionStart)}`
}
