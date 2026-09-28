import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail, isFQDN } from 'class-validator';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import { InitialCredentialsSender } from './initial-credentials-sender';

@Injectable()
export class SmtpInitialCredentialsSender extends InitialCredentialsSender {
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

  async send(credentials: { email: string; password: string }): Promise<void> {
    try {
      const result = await this.transport.sendMail({
        from: { name: 'Cinetadel', address: this.from },
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
      if (
        result.rejected.length ||
        !result.accepted.includes(credentials.email)
      ) {
        throw new Error('SMTP recipient was not accepted.');
      }
    } catch {
      // SMTP errors can contain recipient details; expose only a generic failure.
      throw new Error('Initial credentials email could not be sent.');
    }
  }
}
