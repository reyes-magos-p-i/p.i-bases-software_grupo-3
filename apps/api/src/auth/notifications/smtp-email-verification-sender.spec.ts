jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import { ConfigService } from '@nestjs/config';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import { SmtpEmailVerificationSender } from './smtp-email-verification-sender';

describe('SmtpEmailVerificationSender', () => {
  let settings: Record<string, unknown>;
  const sendMail = jest.fn();
  const createTransport = jest.mocked(nodemailer.createTransport);
  const config = { get: (key: string) => settings[key] } as ConfigService;
  const message = {
    email: 'cliente@example.com',
    confirmationUrl: 'https://cinetadel.example/confirm?token=opaque',
    expiresInMinutes: 30,
  };

  beforeEach(() => {
    settings = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test-smtp-user',
      SMTP_PASSWORD: 'test-smtp-password',
      SMTP_FROM: 'cuentas@example.com',
    };
    sendMail
      .mockReset()
      .mockResolvedValue({ accepted: [message.email], rejected: [] });
    createTransport
      .mockReset()
      .mockReturnValue({ sendMail } as unknown as Mail<SMTPSentMessageInfo>);
  });

  it('sends the confirmation link, branded HTML and inline logo', async () => {
    const sender = new SmtpEmailVerificationSender(config);
    await expect(sender.send(message)).resolves.toBeUndefined();

    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({
      from: { name: 'Cinetadel', address: 'cuentas@example.com' },
      to: { name: '', address: message.email },
      subject: 'Confirma tu cuenta de Cinetadel',
      text: expect.stringContaining(message.confirmationUrl),
      html: expect.stringContaining('Confirma tu cuenta'),
      attachments: [
        {
          filename: 'cinetadel-logo.png',
          cid: 'cinetadel-logo',
        },
      ],
    });
    expect(mail.html).toContain('30 minutos');
    expect(mail.html).toContain(message.confirmationUrl);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each([
    { accepted: [], rejected: [message.email] },
    { accepted: [], rejected: [] },
    { accepted: ['other@example.com'], rejected: [] },
  ])(
    'fails if SMTP does not accept the intended recipient: %p',
    async (result) => {
      sendMail.mockResolvedValue(result);
      const sender = new SmtpEmailVerificationSender(config);

      await expect(sender.send(message)).rejects.toThrow(
        'Email verification could not be sent.',
      );
      expect(sendMail).toHaveBeenCalledTimes(1);
    },
  );

  it('replaces SMTP errors with a generic failure without retrying', async () => {
    sendMail.mockRejectedValue(new Error(`SMTP rejected ${message.email}`));
    const sender = new SmtpEmailVerificationSender(config);

    await expect(sender.send(message)).rejects.toThrow(
      'Email verification could not be sent.',
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid SMTP configuration before creating a transport', () => {
    settings.SMTP_HOST = 'invalid..host';

    expect(() => new SmtpEmailVerificationSender(config)).toThrow(
      'Invalid SMTP configuration: SMTP_HOST.',
    );
    expect(createTransport).not.toHaveBeenCalled();
  });
});
