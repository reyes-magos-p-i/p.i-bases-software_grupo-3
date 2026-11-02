import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mail, SMTPSentMessageInfo } from 'nodemailer';
import QRCode from 'qrcode';
import { createSmtpTransport } from '../../common/smtp-transport';
import { readEmailTheme } from '../../common/email-theme';
import {
  TicketEmailSender,
  TicketEmailDeliveryError,
  type TicketEmailMessage,
} from './ticket-email-sender';
import { ticketEmailTemplate } from './ticket-email-template';

@Injectable()
export class SmtpTicketEmailSender extends TicketEmailSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
  }

  async send(message: TicketEmailMessage): Promise<void> {
    let submitted = false;
    try {
      const theme = readEmailTheme();
      const qr = await QRCode.toBuffer(message.receipt.qrPayload, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 512,
        color: {
          dark: theme['page-background'],
          light: theme['content-background'],
        },
      });
      const body = ticketEmailTemplate(message, theme);
      submitted = true;
      const result = await this.transport.sendMail({
        from: { name: 'Cinetadel', address: this.from },
        to: { name: '', address: message.email },
        subject: 'Tus boletos de Cinetadel · ' + message.receipt.reference,
        ...body,
        attachments: [
          {
            filename: 'compra-qr.png',
            content: qr,
            contentType: 'image/png',
            cid: 'purchase-qr',
          },
        ],
      });
      submitted = false;
      if (result.rejected.length || !result.accepted.includes(message.email))
        throw new TicketEmailDeliveryError(false);
    } catch {
      throw new TicketEmailDeliveryError(submitted);
    }
  }
}
