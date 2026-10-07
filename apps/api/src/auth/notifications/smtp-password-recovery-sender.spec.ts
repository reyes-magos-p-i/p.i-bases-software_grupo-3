jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import { SmtpPasswordRecoverySender } from './smtp-password-recovery-sender';

describe('SmtpPasswordRecoverySender', () => {
  const sendMail = jest.fn();
  let sender: SmtpPasswordRecoverySender;
  const message = {
    email: 'ana@example.com',
    recoveryUrl: 'https://cinema.example/recover-password#token',
    temporaryPassword: 'temporary',
    expiresInMinutes: 30,
  };

  beforeEach(() => {
    sendMail
      .mockReset()
      .mockResolvedValue({ accepted: [message.email], rejected: [] });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as Mail<SMTPSentMessageInfo>);
    const settings: Record<string, string> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'test',
      SMTP_FROM: 'cinema@example.com',
    };
    sender = new SmtpPasswordRecoverySender({
      get: (key: string) => settings[key],
    } as ConfigService);
  });

  it('sends the link, temporary password and expiration warning to the stored recipient', async () => {
    await expect(sender.send(message)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { name: '', address: message.email },
        subject: 'Recupera tu contraseña de Cinetadel',
      }),
    );
    const mail = sendMail.mock.calls[0][0] as { text: string };
    expect(mail.text).toContain(message.recoveryUrl);
    expect(mail.text).toContain(message.temporaryPassword);
    expect(mail.text).toContain('30 minutos');
    expect(mail.text).toContain('Tu contraseña actual no cambia');
  });

  it('notifies a completed change without sending any password', async () => {
    await expect(sender.notifyChanged(message.email)).resolves.toBeUndefined();
    const mail = sendMail.mock.calls[0][0] as { text: string; subject: string };
    expect(mail.subject).toContain('fue actualizada');
    expect(mail.text).not.toContain(message.temporaryPassword);
    expect(mail.text).not.toContain(message.recoveryUrl);
  });

  it.each([
    { accepted: [], rejected: [message.email] },
    { accepted: [], rejected: [] },
  ])('rejects unaccepted delivery %p', async (result) => {
    sendMail.mockResolvedValue(result);
    await expect(sender.send(message)).rejects.toThrow(
      'Password recovery email could not be sent.',
    );
  });

  it('sanitizes transport errors', async () => {
    sendMail.mockRejectedValue(new Error('private SMTP password'));
    await expect(sender.notifyChanged(message.email)).rejects.toThrow(
      'Password recovery email could not be sent.',
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
