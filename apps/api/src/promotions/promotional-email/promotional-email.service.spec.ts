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
});
