jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import { ConfigService } from '@nestjs/config';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import { SmtpInitialCredentialsSender } from './smtp-initial-credentials-sender';

describe('SmtpInitialCredentialsSender', () => {
  let settings: Record<string, unknown>;
  const sendMail = jest.fn();
  const createTransport = jest.mocked(nodemailer.createTransport);
  const config = { get: (key: string) => settings[key] } as ConfigService;
  const credentials = {
    email: 'cliente@example.com',
    password: 'test-generated-password',
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
      .mockResolvedValue({ accepted: [credentials.email], rejected: [] });
    createTransport
      .mockReset()
      .mockReturnValue({ sendMail } as unknown as Mail<SMTPSentMessageInfo>);
  });

  it('requires STARTTLS, certificate validation and bounded timeouts without debug logging', () => {
    new SmtpInitialCredentialsSender(config);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      auth: { user: 'test-smtp-user', pass: 'test-smtp-password' },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      dnsTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('supports implicit TLS and preserves significant SMTP password spaces', () => {
    settings.SMTP_PORT = '465';
    settings.SMTP_SECURE = 'true';
    settings.SMTP_PASSWORD = ' test password ';
    new SmtpInitialCredentialsSender(config);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
        auth: { user: 'test-smtp-user', pass: ' test password ' },
      }),
    );
  });

  it.each([
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ])('rejects a missing %s during construction', (key) => {
    delete settings[key];
    expect(() => new SmtpInitialCredentialsSender(config)).toThrow(
      `Missing or invalid SMTP configuration: ${key}.`,
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([
    ['SMTP_HOST', 'smtp://private.example.com'],
    ['SMTP_HOST', ' smtp.example.com '],
    ['SMTP_HOST', 'bad..example.com'],
    ['SMTP_PORT', '0'],
    ['SMTP_PORT', '-1'],
    ['SMTP_PORT', '65536'],
    ['SMTP_PORT', '1.5'],
    ['SMTP_PORT', '587junk'],
    ['SMTP_PORT', ' 587 '],
    ['SMTP_SECURE', 'TRUE'],
    ['SMTP_SECURE', '1'],
    ['SMTP_FROM', 'private-invalid-address'],
    ['SMTP_FROM', '\uD800@example.com'],
    ['SMTP_FROM', 'Name <cuentas@example.com>'],
    ['SMTP_FROM', 'cuentas@example.com,other@example.com'],
    ['SMTP_USER', '  '],
    ['SMTP_PASSWORD', ''],
    ['SMTP_PASSWORD', true],
  ])(
    'rejects invalid configuration for %s without exposing its value',
    (key, value) => {
      settings[key as string] = value;
      let failure: unknown;
      try {
        new SmtpInitialCredentialsSender(config);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /^(Missing or invalid|Invalid) SMTP configuration: SMTP_[A-Z]+\.$/u,
      );
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it('sends a Spanish plain-text message only to the created account', async () => {
    const sender = new SmtpInitialCredentialsSender(config);
    await expect(sender.send(credentials)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'Cinetadel', address: 'cuentas@example.com' },
      to: { name: '', address: credentials.email },
      subject: 'Tu cuenta de Cinetadel ha sido creada',
      text: [
        'Se ha creado tu cuenta de Cinetadel.',
        '',
        `Correo electrónico: ${credentials.email}`,
        `Contraseña inicial: ${credentials.password}`,
        '',
        'Conserva estos datos en un lugar seguro y no compartas tu contraseña.',
        '',
        'Equipo Cinetadel',
      ].join('\n'),
    });
  });

  it.each([
    { accepted: [], rejected: [credentials.email] },
    { accepted: [], rejected: [] },
    { accepted: ['other@example.com'], rejected: [] },
  ])(
    'fails when SMTP does not accept the intended recipient: %p',
    async (result) => {
      sendMail.mockResolvedValue(result);
      const sender = new SmtpInitialCredentialsSender(config);
      await expect(sender.send(credentials)).rejects.toThrow(
        'Initial credentials email could not be sent.',
      );
      expect(sendMail).toHaveBeenCalledTimes(1);
    },
  );

  it('replaces SMTP errors with a generic error and does not retry', async () => {
    sendMail.mockRejectedValue(
      new Error(`SMTP rejected ${credentials.email}: ${credentials.password}`),
    );
    const sender = new SmtpInitialCredentialsSender(config);
    await expect(sender.send(credentials)).rejects.toThrow(
      'Initial credentials email could not be sent.',
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
