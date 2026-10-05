import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import type { Mail, SMTPSentMessageInfo } from 'nodemailer';
import { createSmtpTransport } from '../../common/smtp-transport';
import { EmailVerificationSender } from './email-verification-sender';

const LOGO_CID = 'cinetadel-logo';
const LOGO_PATH = join(__dirname, '../../assets/cinetadel-logo.png');

@Injectable()
export class SmtpEmailVerificationSender extends EmailVerificationSender {
  private readonly transport: Mail<SMTPSentMessageInfo>;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    ({ transport: this.transport, from: this.from } =
      createSmtpTransport(config));
  }

  async send(message: {
    email: string;
    confirmationUrl: string;
    expiresInMinutes: number;
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
        html: this.buildHtml(message.confirmationUrl, message.expiresInMinutes),
        attachments: [
          {
            filename: 'cinetadel-logo.png',
            path: LOGO_PATH,
            cid: LOGO_CID,
          },
        ],
      });
      if (result.rejected.length || !result.accepted.includes(message.email)) {
        throw new Error('SMTP recipient was not accepted.');
      }
    } catch {
      throw new Error('Email verification could not be sent.');
    }
  }

  public buildHtml(confirmationUrl: string, expiresInMinutes: number): string {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Confirma tu cuenta</title>
</head>
<body style="margin:0; padding:0; background-color:#020617; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

          <!-- Header con logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="cid:${LOGO_CID}" alt="Cinetadel" width="64" height="64" style="display:block; border:0;" />
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="background-color:#0F172A; border-radius:12px; padding:40px 32px; border:1px solid #8A2BE2;">

              <h1 style="margin:0 0 16px; color:#F8F9FA; font-size:22px; font-weight:700; text-align:center;">
                Confirma tu cuenta
              </h1>

              <p style="margin:0 0 24px; color:#F8F9FA; font-size:15px; line-height:1.6; text-align:center; opacity:0.85;">
                Gracias por registrarte en Cinetadel. Confirma tu correo electrónico para activar tu cuenta.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${confirmationUrl}"
                       style="display:inline-block; background-color:#FFD700; color:#020617; text-decoration:none; font-weight:700; font-size:15px; padding:14px 36px; border-radius:8px;">
                      Confirmar mi cuenta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px; color:#F8F9FA; font-size:13px; line-height:1.5; text-align:center; opacity:0.6;">
                Este enlace expira en ${expiresInMinutes} minutos y solo puede usarse una vez.
              </p>

              <p style="margin:24px 0 0; color:#F8F9FA; font-size:12px; line-height:1.5; text-align:center; opacity:0.5;">
                ¿No reconoces esta solicitud? Puedes ignorar este mensaje.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0; color:#F8F9FA; font-size:12px; opacity:0.4;">
                Equipo Cinetadel
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
