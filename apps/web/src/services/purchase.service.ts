import { getApi } from './api'
import { clientRequestOptions } from './authService'
import { clientProfileError } from './client-profile.service'
import { PurchaseResponseError, readPurchaseReceipt } from '@/utils/purchase-response'
import type {
  PurchaseList,
  PurchaseListQuery,
  PurchaseMovie,
  PurchaseFunction,
  SeatAvailability,
  PurchaseSelection,
  PurchaseQuote,
} from '@/types/purchase'
export async function getPurchaseFunctions(movieId: number, signal?: AbortSignal) {
  return (
    await getApi().get<{ movie: PurchaseMovie; functions: PurchaseFunction[] }>(
      `/purchases/movies/${movieId}/functions`,
      { ...clientRequestOptions(), signal },
    )
  ).data
}
export async function getPurchaseSeats(id: number, signal?: AbortSignal) {
  return (
    await getApi().get<SeatAvailability>(`/purchases/functions/${id}/seats`, {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}
export async function quotePurchase(data: PurchaseSelection, signal?: AbortSignal) {
  return (
    await getApi().post<PurchaseQuote>('/purchases/quote', data, {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}
export async function confirmPurchase(
  data: PurchaseSelection & { requestKey: string; quoteVersion: string },
  signal?: AbortSignal,
) {
  return readPurchaseReceipt(
    (
      await getApi().post<unknown>('/purchases', data, {
        ...clientRequestOptions(),
        signal,
        timeout: 30000,
      })
    ).data,
    true,
  )
}
export async function getMyPurchases(query: PurchaseListQuery = {}, signal?: AbortSignal) {
  return (
    await getApi().get<PurchaseList>('/purchases/me', {
      ...clientRequestOptions(),
      params: query,
      signal,
    })
  ).data
}
export async function getMyPurchase(id: number, signal?: AbortSignal) {
  return readPurchaseReceipt(
    (
      await getApi().get<unknown>(`/purchases/me/${id}`, {
        ...clientRequestOptions(),
        signal,
      })
    ).data,
  )
}
export function purchaseError(error: unknown) {
  if (error instanceof PurchaseResponseError) return error.message
  return clientProfileError(error, 'No se pudo completar la operación. Intenta nuevamente.')
}
