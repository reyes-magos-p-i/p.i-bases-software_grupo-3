/** Response of GET /tickets/:id. Dates are "YYYY/MM/DD HH:MM" strings from the database. */
export interface Ticket {
  title: string
  theaterId: number
  startTime: string
  endTime: string
  seat: string
}

/** Item of GET /tickets/:id/alternative-showtimes. */
export interface AlternativeShowtime {
  movieFunctionId: number
  theaterId: number
  time: string
  date: string
  seatRow: number
  seatColumn: number
}

/** Body of PATCH /tickets/:id. */
export interface UpdateTicketRequest {
  movieFunctionId: number
}

/** A ticket shown in the detail dialog, with the number that was searched. */
export type TicketDetail = Ticket & { id: number }
