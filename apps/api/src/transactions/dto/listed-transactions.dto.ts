// A transaction is an invoice. Only paid and cancelled invoices are shown;
// pending and failed payments are not transactions yet.
export const TRANSACTION_STATUSES = ['PAID', 'CANCELLED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// Dates come as "YYYY-MM-DDTHH:mm" in Costa Rica time, so the UI shows them
// as they were recorded, whatever the time zone of the browser.
export interface ListedTransactionDto {
  id: number;
  purchasedAt: string;
  clientName: string;
  clientEmail: string;
  movieTitle: string;
  branchName: string | null;
  theaterId: number;
  functionStart: string;
  tickets: number;
  total: number;
  status: TransactionStatus;
}

export interface ListedTransactionsDto {
  items: ListedTransactionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type PaymentMethod = 'CARD' | 'CASH';
export type ProductType = 'TICKET' | 'FOOD';

// UNIT_PRICE is what was charged, so later price changes do not alter it.
export interface TransactionLineDto {
  productId: number;
  name: string;
  type: ProductType;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

// Card payments keep only the brand Stripe returns (e.g. "visa") and the last 4 digits.
export interface TransactionDetailDto extends ListedTransactionDto {
  paymentMethod: PaymentMethod;
  cardBrand: string | null;
  cardLast4: string | null;
  lines: TransactionLineDto[];
}

export interface TransactionFilterOptionsDto {
  branches: { id: number; name: string | null }[];
  movies: { id: number; title: string }[];
}
