import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import { PurchasesRepository } from './purchases.repository';
import {
  TicketEmailRepository,
  type TicketEmailJob,
} from './ticket-email.repository';
import {
  TicketEmailSender,
  TicketEmailDeliveryError,
} from './notifications/ticket-email-sender';
import type { PurchaseReceipt } from './purchase.types';

@Injectable()
export class TicketEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketEmailService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly emails: TicketEmailRepository,
    private readonly purchases: PurchasesRepository,
    private readonly clients: ClientsService,
    private readonly sender: TicketEmailSender,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.start(), 2000);
    this.timer.unref();
    this.start();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  private start() {
    this.running ??= this.processPending().finally(() => {
      this.running = undefined;
    });
  }

  async processPending() {
    try {
      const jobs = await this.emails.pending();
      const results = await Promise.allSettled(
        jobs.map((job) => this.deliver(job)),
      );
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Ticket email state could not be persisted.');
    } catch {
      this.logger.warn('Ticket email processing is temporarily unavailable.');
    }
  }

  private async deliver(job: TicketEmailJob) {
    if (!(await this.emails.claim(job))) return;
    let status: 'SENT' | 'FAILED' | 'UNKNOWN' = 'SENT';
    try {
      const message = await this.purchases.findForEmail(job.id);
      await this.sender.send({ ...message, email: job.recipient });
    } catch (error) {
      status =
        error instanceof TicketEmailDeliveryError && error.uncertain
          ? 'UNKNOWN'
          : 'FAILED';
    }
    // Failure to persist an accepted send leaves SENDING for later reconciliation, not an automatic retry.
    await this.emails.finish(job, status);
  }

  status(receipt: PurchaseReceipt) {
    return this.emails.status(receipt.id);
  }

  async request(receipt: PurchaseReceipt, clientId?: number) {
    if (receipt.status !== 'PAID' || !receipt.tickets.length)
      throw new BadRequestException(
        'Esta compra no tiene boletos disponibles para enviar.',
      );
    let email = receipt.buyerEmail;
    if (clientId !== undefined) {
      const client = await this.clients.findById(clientId);
      if (!client || (await this.clients.isEmailVerificationPending(clientId)))
        throw new UnauthorizedException(
          'Inicia sesión con una cuenta activa y verificada para reenviar tus boletos.',
        );
      email = client.email;
    }
    return this.emails.request(receipt.id, email);
  }
}
