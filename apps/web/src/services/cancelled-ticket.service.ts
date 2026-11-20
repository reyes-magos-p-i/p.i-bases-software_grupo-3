import { getApi } from './api'
import { clientRequestOptions } from './authService'
import type {
  CancelledTicketDetail,
  TicketRefundRequest,
  TicketShowtimeChange,
} from '@/types/cancelled-ticket'

export async function getCancelledTicket(
  id: number,
  signal?: AbortSignal,
): Promise<CancelledTicketDetail> {
  return (
    await getApi().get<CancelledTicketDetail>(`/client-tickets/${id}`, {
      ...clientRequestOptions(),
      signal,
      timeout: 10000,
    })
  ).data
}

export async function changeTicketShowtime(
  id: number,
  movieFunctionId: number,
): Promise<TicketShowtimeChange> {
  return (
    await getApi().patch<TicketShowtimeChange>(
      `/client-tickets/${id}/showtime`,
      { movieFunctionId },
      { ...clientRequestOptions(), timeout: 30000 },
    )
  ).data
}

export async function requestTicketRefund(id: number): Promise<TicketRefundRequest> {
  return (
    await getApi().post<TicketRefundRequest>(
      `/client-tickets/${id}/refund`,
      {},
      { ...clientRequestOptions(), timeout: 30000 },
    )
  ).data
}
