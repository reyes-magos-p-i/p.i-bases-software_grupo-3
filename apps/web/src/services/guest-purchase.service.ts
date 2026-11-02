import { getApi } from './api'
import type {
  GuestBuyer,
  GuestPurchaseReceipt,
  PurchaseFunction,
  PurchaseMovie,
  PurchaseQuote,
  PurchaseSelection,
  SeatAvailability,
} from '@/types/purchase'

export async function getGuestPurchaseFunctions(id: number, signal?: AbortSignal) {
  return (
    await getApi().get<{ movie: PurchaseMovie; functions: PurchaseFunction[] }>(
      `/guest-purchases/movies/${id}/functions`,
      { signal },
    )
  ).data
}
export async function getGuestPurchaseSeats(id: number, signal?: AbortSignal) {
  return (
    await getApi().get<SeatAvailability>(`/guest-purchases/functions/${id}/seats`, { signal })
  ).data
}
export async function quoteGuestPurchase(data: PurchaseSelection) {
  return (await getApi().post<PurchaseQuote>('/guest-purchases/quote', data)).data
}
export async function identifyGuestBuyer(data: GuestBuyer) {
  return (await getApi().post<{ email: string }>('/guest-purchases/buyer', data)).data
}
export async function confirmGuestPurchase(
  data: PurchaseSelection & GuestBuyer & { requestKey: string; quoteVersion: string },
) {
  const { email, confirmEmail, ...selection } = data
  return (
    await getApi().post<GuestPurchaseReceipt>(
      '/guest-purchases',
      { ...selection, buyer: { email, confirmEmail } },
      { timeout: 30000 },
    )
  ).data
}
export async function lookupGuestPurchase(accessCode: string, signal?: AbortSignal) {
  return (
    await getApi().post<GuestPurchaseReceipt>('/guest-purchases/lookup', { accessCode }, { signal })
  ).data
}
