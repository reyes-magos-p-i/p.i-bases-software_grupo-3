import type {
  PricingSettings,
  TicketCategory,
} from '../common/pricing/ticket-pricing';
export interface PurchaseFunction extends PricingSettings {
  id: number;
  movieId: number;
  title: string;
  synopsis: string;
  posterImage: string;
  branchId: number;
  branchName: string;
  theaterId: number;
  rows: number;
  columns: number;
  startsAt: string;
  endsAt: string;
  status: string;
  available: boolean;
  price: number;
}
export interface PurchaseSeat {
  positionId: number;
  theaterId: number;
  rowNumber: number;
  columnNumber: number;
  type: 'normal' | 'vip' | 'accessibility';
  state: 'free' | 'in-use' | 'unavailable' | 'reserved';
}
export interface SeatSelection {
  GENERAL: number[];
  CHILD: number[];
  SENIOR: number[];
}
export interface PurchaseSelection {
  functionId: number;
  seats: SeatSelection;
}
export interface PurchaseLine {
  code: string;
  category: TicketCategory;
  label: string;
  vip: boolean;
  quantity: number;
  base: number;
  modifiers: { label: string; amount: number }[];
  unitPrice: number;
  subtotal: number;
}
export interface PurchaseQuote {
  function: PurchaseFunction;
  seats: (PurchaseSeat & { category: TicketCategory })[];
  lines: PurchaseLine[];
  total: number;
  quantity: number;
  version: string;
}
export interface PurchasedTicket {
  id: number;
  rowNumber: number;
  columnNumber: number;
  theaterId: number;
  functionId: number;
  title: string;
  startsAt: string;
  functionStatus: string;
  unitPrice: number;
  category: TicketCategory;
}
export interface PurchaseReceipt {
  id: number;
  reference: string;
  purchasedAt: string;
  status: string;
  buyerEmail: string;
  total: number;
  function: PurchaseFunction;
  lines: PurchaseLine[];
  tickets: PurchasedTicket[];
}
export interface GuestPurchaseReceipt extends PurchaseReceipt {
  accessCode: string;
}
