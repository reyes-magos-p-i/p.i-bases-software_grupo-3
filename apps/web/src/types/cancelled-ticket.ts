/** A ticket of a client, as returned by GET /client-tickets/:id. Dates include the -06:00 offset. */
export interface CancelledTicket {
  id: number
  movieFunctionId: number
  title: string
  branchName: string
  theaterId: number
  startsAt: string
  functionStatus: string
  seatRow: number
  seatColumn: number
}

/** Another showtime of the same movie and branch that the ticket can move to. */
export interface CancelledTicketAlternative {
  movieFunctionId: number
  theaterId: number
  time: string
  date: string
  seatRow: number
  seatColumn: number
}

export interface CancelledTicketDetail {
  ticket: CancelledTicket
  alternatives: CancelledTicketAlternative[]
}

/** Response of PATCH /client-tickets/:id/showtime. */
export interface TicketShowtimeChange {
  ticketId: number
  movieFunctionId: number
  theaterId: number
  seatRow: number
  seatColumn: number
}

/** Response of POST /client-tickets/:id/refund. */
export interface TicketRefundRequest {
  ticketId: number
  status: 'REQUESTED'
  estimatedDays: string
}
