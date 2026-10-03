import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail, isFQDN } from 'class-validator';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import { EmailVerificationSender } from './email-verification-sender';

@Injectable()
export class SmtpEmailVerificationSender extends EmailVerificationSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
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
    this.from = required('SMTP_FROM');
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
    if (/[\uD800-\uDFFF]/u.test(this.from) || !isEmail(this.from)) {
      throw new Error('Invalid SMTP configuration: SMTP_FROM.');
    }

    this.transport = nodemailer.createTransport({
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
    });
  }

  async send(message: {
    email: string
    confirmationUrl: string
    expiresInMinutes: number
  }): Promise<void> {
    try {
      const result = await this.transport.sendMail({
        from: { name: 'Cinetadel', address: this.from },
        to: { name: '', address: message.email },
        subject: 'Confirma tu cuenta de Cinetadel',
        text: [
          'Para activar tu cuenta de Cinetadel, confirma tu correo con este enlace:',
          '',
          message.confirmationUrl,
          '',
          `Este enlace solo se puede usar una vez y expirará en ${message.expiresInMinutes} minutos.`,
          'Si no solicitaste esta cuenta, puedes ignorar este mensaje.',
          '',
          'Equipo Cinetadel',
        ].join('\n'),
      });
      if (
        result.rejected.length ||
        !result.accepted.includes(message.email)
      ) {
        throw new Error('SMTP recipient was not accepted.');
      }
    } catch {
      throw new Error('Email verification could not be sent.');
    }
  }
}
