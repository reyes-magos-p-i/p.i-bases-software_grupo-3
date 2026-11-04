import type { PurchaseReceipt } from '../purchase.types';

export interface TicketEmailMessage {
  email: string;
  receipt: PurchaseReceipt;
  accessCode?: string;
}

export class TicketEmailDeliveryError extends Error {
  constructor(
    readonly uncertain: boolean,
    readonly code?: string,
  ) {
    super('Ticket email could not be sent.');
  }
}

export abstract class TicketEmailSender {
  abstract send(message: TicketEmailMessage): Promise<void>;
}
