jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({})) },
}));
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { createSmtpTransport } from './smtp-transport';

const smtp = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'user',
  SMTP_PASSWORD: 'secret',
  SMTP_FROM: 'cinema@example.com',
};

const configFrom = (settings: Record<string, string | undefined>) =>
  ({ get: (key: string) => settings[key] }) as ConfigService;

describe('createSmtpTransport', () => {
  const createTransport = jest.mocked(nodemailer.createTransport);

  beforeEach(() => createTransport.mockClear());

  it('uses the configured SMTP server when NODE_ENV is production', () => {
    const result = createSmtpTransport(
      configFrom({ NODE_ENV: 'production', ...smtp }),
    );

    expect(result.from).toBe('cinema@example.com');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user', pass: 'secret' },
      }),
    );
  });

  it('still requires the SMTP settings in production', () => {
    expect(() =>
      createSmtpTransport(
        configFrom({ NODE_ENV: 'production', ...smtp, SMTP_HOST: undefined }),
      ),
    ).toThrow('Missing or invalid SMTP configuration: SMTP_HOST.');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each(['development', 'test', 'staging', undefined])(
    'captures mail locally when NODE_ENV is %s',
    (nodeEnv) => {
      createSmtpTransport(configFrom({ NODE_ENV: nodeEnv, ...smtp }));

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '127.0.0.1',
          port: 1025,
          ignoreTLS: true,
        }),
      );
      expect(createTransport.mock.calls[0][0]).not.toHaveProperty('auth');
    },
  );

  it('does not need SMTP credentials outside production', () => {
    const result = createSmtpTransport(configFrom({ NODE_ENV: 'staging' }));

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(result.from).toBe('cinetadel-test@localhost.localdomain');
  });

  it('keeps a valid SMTP_FROM as the sender outside production', () => {
    const result = createSmtpTransport(
      configFrom({ NODE_ENV: 'development', SMTP_FROM: 'cinema@example.com' }),
    );

    expect(result.from).toBe('cinema@example.com');
  });

  it('ignores an invalid SMTP_FROM outside production', () => {
    const result = createSmtpTransport(
      configFrom({ NODE_ENV: 'development', SMTP_FROM: 'not-an-email' }),
    );

    expect(result.from).toBe('cinetadel-test@localhost.localdomain');
  });
});
