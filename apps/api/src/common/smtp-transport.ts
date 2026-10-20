import { ConfigService } from '@nestjs/config';
import { isEmail, isFQDN } from 'class-validator';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';

export interface SmtpTransportConfiguration {
  transport: Mail<SMTPSentMessageInfo>;
  from: string;
}

export function createSmtpTransport(
  config: ConfigService,
): SmtpTransportConfiguration {
  const required = (key: string): string => {
    const value = config.get<unknown>(key);
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Missing or invalid SMTP configuration: ${key}.`);
    }
    return value;
  };

  const host = required('SMTP_HOST');
  const portValue = required('SMTP_PORT');
  const secureValue = required('SMTP_SECURE');
  const user = required('SMTP_USER');
  const pass = required('SMTP_PASSWORD');
  const from = required('SMTP_FROM');
  if (!isFQDN(host, { require_tld: false })) {
    throw new Error('Invalid SMTP configuration: SMTP_HOST.');
  }
  const port = Number(portValue);
  if (
    !/^[1-9]\d*$/u.test(portValue) ||
    !Number.isInteger(port) ||
    port > 65535
  ) {
    throw new Error('Invalid SMTP configuration: SMTP_PORT.');
  }
  if (secureValue !== 'true' && secureValue !== 'false') {
    throw new Error('Invalid SMTP configuration: SMTP_SECURE.');
  }
  if (/[\uD800-\uDFFF]/u.test(from) || !isEmail(from)) {
    throw new Error('Invalid SMTP configuration: SMTP_FROM.');
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: secureValue === 'true',
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      dnsTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  };
}
