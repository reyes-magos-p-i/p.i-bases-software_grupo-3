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

interface SmtpFailure {
  code?: unknown;
  responseCode?: unknown;
  syscall?: unknown;
}

// nodemailer reports a socket lost before and after the message data the same
// way, so only a server rejection or a failed connection proves nothing was sent.
function notSent(failure: SmtpFailure): boolean {
  return (
    (typeof failure.responseCode === 'number' && failure.responseCode >= 400) ||
    failure.syscall === 'connect' ||
    failure.code === 'EDNS'
  );
}

// nodemailer codes are fixed values such as ESOCKET; anything else stays out of the logs.
function smtpCode(failure: SmtpFailure): string | undefined {
  return typeof failure.code === 'string' && /^E[A-Z]+$/u.test(failure.code)
    ? failure.code
    : undefined;
}

@Injectable()
export class SmtpTicketEmailSender extends TicketEmailSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
  }

  private guestAccessUrl(accessCode?: string): string | undefined {
    if (!accessCode) return undefined;
    const url = new URL(
      '/guest-purchases/receipt',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    url.hash = accessCode;
    return url.toString();
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
      const body = ticketEmailTemplate(
        message,
        theme,
        this.guestAccessUrl(message.accessCode),
      );
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
    } catch (error) {
      const failure = (error ?? {}) as SmtpFailure;
      throw new TicketEmailDeliveryError(
        submitted && !notSent(failure),
        smtpCode(failure),
      );
    }
  }
}
