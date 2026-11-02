import { getApi } from './api'
import { readGuestPurchaseReceipt, readTicketEmailStatus } from '@/utils/purchase-response'
import type {
  GuestBuyer,
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
      { signal, timeout: 10000 },
    )
  ).data
}
export async function getGuestPurchaseSeats(id: number, signal?: AbortSignal) {
  return (
    await getApi().get<SeatAvailability>(`/guest-purchases/functions/${id}/seats`, {
      signal,
      timeout: 10000,
    })
  ).data
}
export async function quoteGuestPurchase(data: PurchaseSelection, signal?: AbortSignal) {
  return (
    await getApi().post<PurchaseQuote>('/guest-purchases/quote', data, { signal, timeout: 10000 })
  ).data
}
export async function identifyGuestBuyer(data: GuestBuyer, signal?: AbortSignal) {
  return (
    await getApi().post<{ email: string }>('/guest-purchases/buyer', data, {
      signal,
      timeout: 10000,
    })
  ).data
}
export async function confirmGuestPurchase(
  data: PurchaseSelection & GuestBuyer & { requestKey: string; quoteVersion: string },
) {
  const { email, confirmEmail, ...selection } = data
  return readGuestPurchaseReceipt(
    (
      await getApi().post<unknown>(
        '/guest-purchases',
        { ...selection, buyer: { email, confirmEmail } },
        { timeout: 30000 },
      )
    ).data,
  )
}
export async function lookupGuestPurchase(accessCode: string, signal?: AbortSignal) {
  return readGuestPurchaseReceipt(
    (
      await getApi().post<unknown>(
        '/guest-purchases/lookup',
        { accessCode },
        { signal, timeout: 10000 },
      )
    ).data,
  )
}
export async function getGuestTicketEmailStatus(accessCode: string, signal?: AbortSignal) {
  return readTicketEmailStatus(
    (
      await getApi().post<unknown>(
        '/guest-purchases/email-status',
        { accessCode },
        { signal, timeout: 10000 },
      )
    ).data,
  )
}
export async function resendGuestPurchaseTickets(accessCode: string, signal?: AbortSignal) {
  return readTicketEmailStatus(
    (
      await getApi().post<unknown>(
        '/guest-purchases/resend-tickets',
        { accessCode },
        { signal, timeout: 10000 },
      )
    ).data,
  )
}
