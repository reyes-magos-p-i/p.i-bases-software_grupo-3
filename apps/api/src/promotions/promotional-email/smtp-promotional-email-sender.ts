import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mail, SMTPSentMessageInfo } from 'nodemailer';
import { createSmtpTransport } from '../../common/smtp-transport';
import {
  promotionalEmailTemplate,
  type PromotionalEmailMessage,
} from './promotional-email-template';

@Injectable()
export class SmtpPromotionalEmailSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
  }

  async send(message: PromotionalEmailMessage): Promise<void> {
    const result = await this.transport.sendMail({
      from: { name: 'Cinetadel', address: this.from },
      to: { name: message.clientName, address: message.email },
      subject: 'Anuncios y promociones del mes - Cinetadel',
      ...promotionalEmailTemplate(message),
    });
    if (result.rejected.length || !result.accepted.includes(message.email))
      throw new Error('Promotional email was not accepted.');
  }
}
