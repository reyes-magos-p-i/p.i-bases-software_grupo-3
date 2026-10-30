/** Shape returned by GET /tickets/:id. Times are "YYYY/MM/DD HH:MM" strings from the database. */
export class Ticket {
  title: string;
  theaterId: number;
  startTime: string;
  endTime: string;
  seat: string;
}
