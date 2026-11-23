import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mail, SMTPSentMessageInfo } from 'nodemailer';
import { createSmtpTransport } from '../../common/smtp-transport';
import {
  CancelledProjectionEmailSender,
  type CancelledProjectionEmailMessage,
} from './cancelled-projection-email-sender';
import { cancelledProjectionEmailTemplate } from './cancelled-projection-email-template';

@Injectable()
export class SmtpCancelledProjectionEmailSender extends CancelledProjectionEmailSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
  }

  async send(message: CancelledProjectionEmailMessage): Promise<void> {
    const result = await this.transport.sendMail({
      from: { name: 'Cinetadel', address: this.from },
      to: { name: message.clientName, address: message.email },
      subject: 'Tu proyección fue cancelada - Cinetadel',
      ...cancelledProjectionEmailTemplate(message),
    });
    if (result.rejected.length || !result.accepted.includes(message.email))
      throw new Error('Cancelled projection email was not accepted.');
  }
}
