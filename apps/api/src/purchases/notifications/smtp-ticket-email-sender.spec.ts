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

const renderQr = QRCode.toBuffer;

describe('SMTP ticket delivery', () => {
  const sendMail = jest.fn();
  let sender: SmtpTicketEmailSender;
  let settings: Record<string, string>;
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
    settings = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test',
      SMTP_PASSWORD: 'test',
      SMTP_FROM: 'cinema@example.com',
      FRONTEND_URL: 'https://cinema.example',
    };
    sender = new SmtpTicketEmailSender(new ConfigService(settings));
  });
  // Inside Jest, pngjs takes seconds to pick a filter for each row, so only
  // the PNG test renders a real QR, and with a fixed filter.
  const generate = () => jest.mocked(QRCode.toBuffer);
  beforeEach(() => {
    jest
      .spyOn(QRCode, 'toBuffer')
      .mockImplementation(() => Promise.resolve(Buffer.from('qr')));
  });
  afterEach(() => jest.restoreAllMocks());
  it('sends only the readable QR PNG as an in-memory inline attachment with the canonical payload', async () => {
    generate().mockImplementation((text, options) =>
      renderQr(text, {
        ...options,
        rendererOpts: Object.assign({}, options.rendererOpts, {
          filterType: 0,
        }),
      }),
    );
    await sender.send(message);
    expect(generate()).toHaveBeenCalledWith(
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
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.cid).toBe('purchase-qr');
    expect(mail.text).not.toContain('/guest-purchases/receipt');
    expect(mail.html).not.toContain('Ver mi compra');
  });
  it('includes the same private receipt link on initial delivery and resend without changing the QR', async () => {
    const accessCode = '12.4AVG75NWK52Z476W4QDMW7DYQE';
    const link = 'https://cinema.example/guest-purchases/receipt#' + accessCode;
    await sender.send({ ...message, accessCode });
    await sender.send({ ...message, accessCode });
    expect(sendMail).toHaveBeenCalledTimes(2);
    for (const [mail] of sendMail.mock.calls) {
      expect(mail.text).toContain('Ver mi compra: ' + link);
      expect(mail.html).toContain(`href="${link}"`);
      expect(mail.text).not.toContain('Código privado de consulta');
      expect(mail.html).not.toContain('pie de página');
      expect(mail.to.address).toBe(message.email);
    }
    expect(generate()).toHaveBeenNthCalledWith(
      2,
      message.receipt.qrPayload,
      expect.any(Object),
    );
  });
  it.each([undefined, 'not-a-url'])(
    'does not send a guest email with an unusable frontend URL: %s',
    async (value) => {
      if (value === undefined) delete settings.FRONTEND_URL;
      else settings.FRONTEND_URL = value;
      await expect(
        sender.send({ ...message, accessCode: '12.PRIVATE' }),
      ).rejects.toMatchObject({
        uncertain: false,
        message: 'Ticket email could not be sent.',
      });
      expect(sendMail).not.toHaveBeenCalled();
    },
  );
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
  // Error shapes recorded from nodemailer against a fake SMTP server.
  it.each([
    ['refused connection', { code: 'ESOCKET', syscall: 'connect' }, 'ESOCKET'],
    ['failed DNS lookup', { code: 'EDNS' }, 'EDNS'],
    ['bad credentials', { code: 'EAUTH', responseCode: 535 }, 'EAUTH'],
    [
      'refused recipient',
      { code: 'EENVELOPE', responseCode: 550 },
      'EENVELOPE',
    ],
    ['refused message', { code: 'EMESSAGE', responseCode: 554 }, 'EMESSAGE'],
  ])('reports a %s as definitely not sent', async (_case, failure, code) => {
    sendMail.mockRejectedValue(Object.assign(new Error('private'), failure));
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: false,
      code,
    });
  });
  it('stays uncertain when the connection drops, since SMTP may have accepted the message', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('private'), {
        code: 'ECONNECTION',
        command: 'CONN',
      }),
    );
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: true,
      code: 'ECONNECTION',
    });
  });
  it('keeps unexpected failure details out of the delivery code', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('private'), { code: 'user@example.com' }),
    );
    const failure: unknown = await sender
      .send(message)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ uncertain: true });
    expect((failure as { code?: string }).code).toBeUndefined();
  });
  it('tolerates a rejection without details', async () => {
    sendMail.mockRejectedValue(undefined);
    await expect(sender.send(message)).rejects.toMatchObject({
      uncertain: true,
    });
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
