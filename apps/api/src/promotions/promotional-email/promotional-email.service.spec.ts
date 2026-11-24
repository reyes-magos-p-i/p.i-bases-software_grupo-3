import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionalEmailRepository } from './promotional-email.repository';
import { PromotionalEmailService } from './promotional-email.service';
import { SmtpPromotionalEmailSender } from './smtp-promotional-email-sender';

const FRONTEND_URL = 'https://cinema.example';
// 2026-12-01 09:30 in Costa Rica (UTC-6) and 08:30 the same day (before the send hour).
const FIRST_DAY_AFTER_NINE = new Date('2026-12-01T15:30:00Z');
const FIRST_DAY_BEFORE_NINE = new Date('2026-12-01T14:30:00Z');
const SECOND_DAY = new Date('2026-12-02T15:30:00Z');

describe('PromotionalEmailService', () => {
  let repository: {
    findActivePromotions: jest.Mock;
    findRecipients: jest.Mock;
  };
  let sender: { send: jest.Mock };
  let service: PromotionalEmailService;

  beforeEach(() => {
    repository = {
      findActivePromotions: jest
        .fn()
        .mockResolvedValue([
          { title: 'Estreno', description: 'Nueva película' },
        ]),
      findRecipients: jest.fn().mockResolvedValue([
        { clientId: 1, email: 'ana@example.com', name: 'Ana' },
        { clientId: 2, email: 'luis@example.com', name: 'Luis' },
      ]),
    };
    sender = { send: jest.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(FRONTEND_URL),
    } as unknown as ConfigService;
    service = new PromotionalEmailService(
      repository as unknown as PromotionalEmailRepository,
      sender as unknown as SmtpPromotionalEmailSender,
      config,
    );
  });

  it('sends once to every opted-in client on the first day of the month', async () => {
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: 'Ana',
        email: 'ana@example.com',
        billboardUrl: `${FRONTEND_URL}/buy-tickets`,
        preferencesUrl: `${FRONTEND_URL}/account/profile?section=preferences`,
      }),
    );
  });

  it('does not send again within the same month', async () => {
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('does nothing before the send hour or on other days', async () => {
    await service.sendIfDue(FIRST_DAY_BEFORE_NINE);
    await service.sendIfDue(SECOND_DAY);

    expect(repository.findRecipients).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('skips the send when there are no active promotions', async () => {
    repository.findActivePromotions.mockResolvedValue([]);

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('keeps sending to the other clients when one delivery fails', async () => {
    sender.send
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValueOnce(undefined);

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('sends at exactly the send hour', async () => {
    // 09:00 in Costa Rica.
    await service.sendIfDue(new Date('2026-12-01T15:00:00Z'));

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('sends again in the next month', async () => {
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);
    // 2027-01-01 09:00 in Costa Rica.
    await service.sendIfDue(new Date('2027-01-01T15:00:00Z'));

    expect(sender.send).toHaveBeenCalledTimes(4);
  });

  it('retries the same month when the run fails before sending', async () => {
    repository.findActivePromotions.mockRejectedValueOnce(
      new Error('database down'),
    );

    await expect(service.sendIfDue(FIRST_DAY_AFTER_NINE)).rejects.toThrow(
      'database down',
    );
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('does not look up recipients when there are no active promotions', async () => {
    repository.findActivePromotions.mockResolvedValue([]);

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(repository.findRecipients).not.toHaveBeenCalled();
  });

  it('sends nothing when no client opted in', async () => {
    repository.findRecipients.mockResolvedValue([]);

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('ignores a run requested while another run is still in progress', async () => {
    let finishLookup: (promotions: unknown[]) => void = () => undefined;
    repository.findActivePromotions.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const firstRun = service.sendIfDue(FIRST_DAY_AFTER_NINE);
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);
    finishLookup([{ title: 'Estreno', description: 'Nueva película' }]);
    await firstRun;

    expect(repository.findActivePromotions).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('sends the active promotions and the links to every email', async () => {
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledWith({
      clientName: 'Luis',
      email: 'luis@example.com',
      promotions: [{ title: 'Estreno', description: 'Nueva película' }],
      billboardUrl: `${FRONTEND_URL}/buy-tickets`,
      preferencesUrl: `${FRONTEND_URL}/account/profile?section=preferences`,
    });
  });

  it('retries the same month when the recipient lookup fails', async () => {
    repository.findRecipients.mockRejectedValueOnce(new Error('database down'));

    await expect(service.sendIfDue(FIRST_DAY_AFTER_NINE)).rejects.toThrow(
      'database down',
    );
    expect(sender.send).not.toHaveBeenCalled();

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('does not send and retries the same month when FRONTEND_URL is missing', async () => {
    const config = {
      getOrThrow: jest.fn().mockImplementation(() => {
        throw new Error('Missing FRONTEND_URL');
      }),
    } as unknown as ConfigService;
    service = new PromotionalEmailService(
      repository as unknown as PromotionalEmailRepository,
      sender as unknown as SmtpPromotionalEmailSender,
      config,
    );

    await expect(service.sendIfDue(FIRST_DAY_AFTER_NINE)).rejects.toThrow(
      'Missing FRONTEND_URL',
    );
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('does not retry the same month after every delivery has failed', async () => {
    sender.send.mockRejectedValue(new Error('SMTP down'));

    await service.sendIfDue(FIRST_DAY_AFTER_NINE);
    await service.sendIfDue(FIRST_DAY_AFTER_NINE);

    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  describe('scheduling', () => {
    const ONE_HOUR_MS = 60 * 60 * 1000;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      service.onModuleDestroy();
      jest.useRealTimers();
    });

    it('checks whether a send is due every hour after the module starts', () => {
      const sendIfDue = jest
        .spyOn(service, 'sendIfDue')
        .mockResolvedValue(undefined);

      service.onModuleInit();
      jest.advanceTimersByTime(ONE_HOUR_MS * 2);

      expect(sendIfDue).toHaveBeenCalledTimes(2);
    });

    it('stops checking once the module is destroyed', () => {
      const sendIfDue = jest
        .spyOn(service, 'sendIfDue')
        .mockResolvedValue(undefined);

      service.onModuleInit();
      service.onModuleDestroy();
      jest.advanceTimersByTime(ONE_HOUR_MS * 2);

      expect(sendIfDue).not.toHaveBeenCalled();
    });

    it('logs a failed scheduled run and keeps checking', async () => {
      const sendIfDue = jest
        .spyOn(service, 'sendIfDue')
        .mockRejectedValueOnce(new Error('database down'))
        .mockResolvedValue(undefined);
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(ONE_HOUR_MS * 2);

      expect(sendIfDue).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        'Monthly promotional email run failed.',
        expect.any(String),
      );
      logError.mockRestore();
    });

    it('can be destroyed without ever being initialized', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
