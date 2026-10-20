import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mail, SMTPSentMessageInfo } from 'nodemailer';
import { createSmtpTransport } from '../../common/smtp-transport';
import { InitialCredentialsSender } from './initial-credentials-sender';

@Injectable()
export class SmtpInitialCredentialsSender extends InitialCredentialsSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
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
