/** Response of GET /tickets/:id. Dates are "YYYY/MM/DD HH:MM" strings from the database. */
export interface Ticket {
  title: string
  theaterId: number
  startTime: string
  endTime: string
  seat: string
}

/** A ticket shown in the detail dialog, with the number that was searched. */
export type TicketDetail = Ticket & { id: number }
