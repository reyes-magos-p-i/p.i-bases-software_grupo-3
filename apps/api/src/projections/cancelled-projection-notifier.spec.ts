import { ConfigService } from '@nestjs/config';
import { CancelledProjectionNotifier } from './cancelled-projection-notifier';
import type { CancelledProjectionEmailSender } from './notifications/cancelled-projection-email-sender';
import type { ProjectionsRepository } from './projections.repository';

describe('CancelledProjectionNotifier', () => {
  const recipients = [
    {
      ticketId: 11,
      email: 'ana@example.com',
      clientName: 'Ana Mora',
      movieTitle: 'Dune',
      startsAt: '2026-11-14T18:30:00-06:00',
    },
    {
      ticketId: 12,
      email: 'luis@example.com',
      clientName: 'Luis Vega',
      movieTitle: 'Dune',
      startsAt: '2026-11-14T18:30:00-06:00',
    },
  ];

  const build = () => {
    const repository = {
      findCancellationRecipients: jest.fn().mockResolvedValue(recipients),
    };
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://cinetadel.test'),
    };
    const notifier = new CancelledProjectionNotifier(
      repository as unknown as ProjectionsRepository,
      sender as unknown as CancelledProjectionEmailSender,
      config as unknown as ConfigService,
    );
    return { notifier, repository, sender };
  };

  it('sends one email per ticket with a link to the change page', async () => {
    const { notifier, repository, sender } = build();

    await notifier.notify(7);

    expect(repository.findCancellationRecipients).toHaveBeenCalledWith(7);
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenNthCalledWith(1, {
      ...recipients[0],
      changeUrl: 'https://cinetadel.test/cancelled-tickets/11',
    });
  });

  it('keeps sending to the other clients when one email fails', async () => {
    const { notifier, sender } = build();
    sender.send
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);

    await expect(notifier.notify(7)).resolves.toBeUndefined();
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('never throws when the recipient lookup fails', async () => {
    const { notifier, repository, sender } = build();
    repository.findCancellationRecipients.mockRejectedValueOnce(
      new Error('db down'),
    );

    await expect(notifier.notify(7)).resolves.toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
  });
});
