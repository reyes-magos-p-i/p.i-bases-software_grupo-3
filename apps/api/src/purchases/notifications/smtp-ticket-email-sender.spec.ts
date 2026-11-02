jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Mail, type SMTPSentMessageInfo } from 'nodemailer';
import QRCode from 'qrcode';
import { SmtpTicketEmailSender } from './smtp-ticket-email-sender';
import type { TicketEmailMessage } from './ticket-email-sender';
import { purchaseQrPayload } from '../purchase-rules';

describe('SMTP ticket delivery', () => {
  const sendMail = jest.fn();
  let sender: SmtpTicketEmailSender;
  const message = {
    email: 'client@example.com',
    receipt: {
      reference: 'ORD-000012',
      qrPayload: purchaseQrPayload('ORD-000012'),
      function: { id: 4 },
      tickets: [
        {
          id: 1,
          title: 'Película',
          branchName: 'Centro',
          theaterId: 3,
          functionId: 4,
          startsAt: '2099-01-01T20:00:00-06:00',
          rowNumber: 1,
          columnNumber: 2,
          category: 'GENERAL',
          functionStatus: 'ACTIVE',
        },
      ],
    },
  } as TicketEmailMessage;
  beforeEach(() => {
    sendMail
      .mockReset()
      .mockResolvedValue({ accepted: [message.email], rejected: [] });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as Mail<SMTPSentMessageInfo>);
    const settings: Record<string, string> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test',
      SMTP_PASSWORD: 'test',
      SMTP_FROM: 'cinema@example.com',
    };
    sender = new SmtpTicketEmailSender({
      get: (key: string) => settings[key],
    } as ConfigService);
  });
  afterEach(() => jest.restoreAllMocks());
  it('sends a readable PNG and logo as in-memory inline attachments with the canonical QR payload', async () => {
    const generate = jest.spyOn(QRCode, 'toBuffer');
    await sender.send(message);
    expect(generate).toHaveBeenCalledWith(
      message.receipt.qrPayload,
      expect.objectContaining({
        width: 512,
        margin: 4,
        errorCorrectionLevel: 'M',
      }),
    );
    const mail = sendMail.mock.calls[0][0] as {
      to: { address: string };
      text: string;
      html: string;
      attachments: { cid: string; content: Buffer }[];
    };
    expect(mail.to.address).toBe(message.email);
    expect(mail.text).toContain('Fila 1, asiento 2');
    expect(mail.html).toContain('cid:purchase-qr');
    const png = mail.attachments.find(
      (item) => item.cid === 'purchase-qr',
    )!.content;
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(512);
    expect(
      mail.attachments.find((item) => item.cid === 'cinetadel-logo')!.content
        .length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { accepted: [], rejected: [message.email] },
    { accepted: [], rejected: [] },
  ])('reports an explicit recipient rejection as failed %s', async (result) => {
    sendMail.mockResolvedValue(result);
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: false,
      message: 'Ticket email could not be sent.',
    });
  });
  it('treats a transport failure after submission as uncertain and never exposes its private details', async () => {
    sendMail.mockRejectedValue(new Error('SMTP private credentials'));
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: true,
      message: 'Ticket email could not be sent.',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('does not contact SMTP if QR preparation fails', async () => {
    jest
      .spyOn(QRCode, 'toBuffer')
      .mockImplementation(() => Promise.reject(new Error('invalid data')));
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: false,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
