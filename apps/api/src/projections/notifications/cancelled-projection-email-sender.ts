export interface CancelledProjectionEmailMessage {
  email: string;
  clientName: string;
  movieTitle: string;
  startsAt: string;
  ticketId: number;
  changeUrl: string;
}

export abstract class CancelledProjectionEmailSender {
  abstract send(message: CancelledProjectionEmailMessage): Promise<void>;
}
