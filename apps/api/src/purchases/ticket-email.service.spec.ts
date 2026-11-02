import { Logger } from '@nestjs/common';
import { TicketEmailService } from './ticket-email.service';
import type { TicketEmailRepository } from './ticket-email.repository';
import type { PurchasesRepository } from './purchases.repository';
import type { ClientsService } from '../clients/clients.service';
import {
  TicketEmailSender,
  TicketEmailDeliveryError,
} from './notifications/ticket-email-sender';
import type { PurchaseReceipt } from './purchase.types';

describe('Ticket email processing', () => {
  const emails = {
      pending: jest.fn(),
      claim: jest.fn(),
      finish: jest.fn(),
      status: jest.fn(),
      request: jest.fn(),
    },
    purchases = { findForEmail: jest.fn() },
    clients = { findById: jest.fn(), isEmailVerificationPending: jest.fn() },
    sender = { send: jest.fn() };
  const service = new TicketEmailService(
    emails as unknown as TicketEmailRepository,
    purchases as unknown as PurchasesRepository,
    clients as unknown as ClientsService,
    sender as TicketEmailSender,
  );
  const job = {
    id: 12,
    recipient: 'original@example.com',
    attemptId: 'attempt',
  };
  const receipt = {
    id: 12,
    status: 'PAID',
    buyerEmail: job.recipient,
    tickets: [{ id: 1 }],
  } as PurchaseReceipt;
  beforeEach(() => {
    jest.resetAllMocks();
    emails.pending.mockResolvedValue([job]);
    emails.claim.mockResolvedValue(true);
    purchases.findForEmail.mockResolvedValue({
      receipt,
      accessCode: 'private',
    });
    clients.findById.mockResolvedValue({ email: 'verified@example.com' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('sends only the claimed purchase and records SMTP acceptance', async () => {
    await service.processPending();
    expect(sender.send).toHaveBeenCalledWith({
      receipt,
      accessCode: 'private',
      email: job.recipient,
    });
    expect(emails.finish).toHaveBeenCalledWith(job, 'SENT');
    expect(purchases.findForEmail).toHaveBeenCalledWith(12);
  });
  it('does not send a job already claimed by another process', async () => {
    emails.claim.mockResolvedValue(false);
    await service.processPending();
    expect(sender.send).not.toHaveBeenCalled();
    expect(emails.finish).not.toHaveBeenCalled();
  });
  it.each([
    [new Error('template failed'), 'FAILED'],
    [new TicketEmailDeliveryError(false), 'FAILED'],
    [new TicketEmailDeliveryError(true), 'UNKNOWN'],
  ])('isolates delivery failures %s as %s', async (error, state) => {
    sender.send.mockRejectedValue(error);
    await expect(service.processPending()).resolves.toBeUndefined();
    expect(emails.finish).toHaveBeenCalledWith(job, state);
    expect(emails.request).not.toHaveBeenCalled();
  });
  it('does not contact SMTP when the current tickets cannot be read', async () => {
    purchases.findForEmail.mockRejectedValue(new Error('cancelled'));
    await service.processPending();
    expect(sender.send).not.toHaveBeenCalled();
    expect(emails.finish).toHaveBeenCalledWith(job, 'FAILED');
  });
  it('logs a sanitized operational warning without retrying an accepted message', async () => {
    const log = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    emails.finish.mockRejectedValue(new Error('sensitive data'));
    await service.processPending();
    expect(log).toHaveBeenCalledWith(
      'Ticket email processing is temporarily unavailable.',
    );
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(emails.request).not.toHaveBeenCalled();
  });
  it('uses the verified current client address and the immutable guest address for manual resends', async () => {
    emails.request.mockResolvedValue({ status: 'PENDING' });
    await expect(service.request(receipt, 8)).resolves.toEqual({
      status: 'PENDING',
    });
    expect(emails.request).toHaveBeenLastCalledWith(12, 'verified@example.com');
    await service.request(receipt);
    expect(emails.request).toHaveBeenLastCalledWith(12, job.recipient);
    expect(clients.findById).toHaveBeenCalledTimes(1);
  });
  it.each([null, { email: 'pending@example.com' }])(
    'refuses missing or unverified accounts %s',
    async (client) => {
      clients.findById.mockResolvedValue(client);
      clients.isEmailVerificationPending.mockResolvedValue(true);
      await expect(service.request(receipt, 8)).rejects.toMatchObject({
        status: 401,
      });
      expect(emails.request).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...receipt, status: 'CANCELLED' },
    { ...receipt, tickets: [] },
  ])('refuses unavailable tickets %s', async (invalid) => {
    await expect(service.request(invalid)).rejects.toMatchObject({
      status: 400,
    });
    expect(emails.request).not.toHaveBeenCalled();
  });
  it('returns the status only for the supplied authorized receipt', async () => {
    emails.status.mockResolvedValue({ status: 'SENT' });
    expect(await service.status(receipt)).toEqual({ status: 'SENT' });
    expect(emails.status).toHaveBeenCalledWith(12);
  });
  it('starts and stops its worker without overlapping slow batches', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    emails.pending.mockImplementationOnce(() =>
      new Promise<void>((resolve) => {
        release = () => resolve();
      }).then(() => []),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(6000);
    expect(emails.pending).toHaveBeenCalledTimes(1);
    release();
    await service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(4000);
    expect(emails.pending).toHaveBeenCalledTimes(1);
  });
});
