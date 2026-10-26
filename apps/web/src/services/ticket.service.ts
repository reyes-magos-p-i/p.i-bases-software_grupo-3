import { getApi } from '@/services/api'
import type { Ticket } from '@/types/ticket'

// The API answers with an empty body (not a 404) when the ticket does not exist.
export async function getTicket(id: number, signal?: AbortSignal): Promise<Ticket | null> {
  const response = await getApi().get<Ticket | ''>(`/tickets/${id}`, { signal, timeout: 10000 })
  return response.data || null
}
