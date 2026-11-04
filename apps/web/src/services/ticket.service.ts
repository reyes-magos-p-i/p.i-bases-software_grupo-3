import { getApi } from '@/services/api'
import type { AlternativeShowtime, Ticket, UpdateTicketRequest } from '@/types/ticket'

// The API answers with an empty body (not a 404) when the ticket does not exist.
export async function getTicket(id: number, signal?: AbortSignal): Promise<Ticket | null> {
  const response = await getApi().get<Ticket | ''>(`/tickets/${id}`, { signal, timeout: 10000 })
  return response.data || null
}

export async function getAlternativeShowtimes(id: number): Promise<AlternativeShowtime[]> {
  const response = await getApi().get<AlternativeShowtime[]>(`/tickets/${id}/alternative-showtimes`, {
    timeout: 10000,
  })
  return response.data
}

export async function updateTicket(id: number, data: UpdateTicketRequest): Promise<void> {
  await getApi().patch(`/tickets/${id}`, data, { timeout: 30000 })
}
