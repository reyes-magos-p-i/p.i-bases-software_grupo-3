/** Response of GET /tickets/:id. Dates are "YYYY/MM/DD HH:MM" strings from the database. */
export interface Ticket {
  title: string
  theaterId: number
  startTime: string
  endTime: string
  seat: string
}
