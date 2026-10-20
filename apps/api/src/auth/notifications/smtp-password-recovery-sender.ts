import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createSmtpTransport,
  type SmtpTransportConfiguration,
} from '../../common/smtp-transport';
import { PasswordRecoverySender } from './password-recovery-sender';

@Injectable()
export class SmtpPasswordRecoverySender extends PasswordRecoverySender {
  private readonly smtp: SmtpTransportConfiguration;

  constructor(config: ConfigService) {
    super();
    this.smtp = createSmtpTransport(config);
  }

  send(message: {
    email: string;
    recoveryUrl: string;
    temporaryPassword: string;
    expiresInMinutes: number;
  }): Promise<void> {
    return this.deliver(
      message.email,
      'Recupera tu contraseña de Cinetadel',
      [
        'Solicitaste recuperar tu contraseña de Cinetadel.',
        `Abre este enlace: ${message.recoveryUrl}`,
        `Contraseña temporal: ${message.temporaryPassword}`,
        `El enlace y la contraseña temporal vencen en ${message.expiresInMinutes} minutos y solo sirven para esta recuperación.`,
        'Tu contraseña actual no cambia hasta que completes el proceso.',
        'Si no solicitaste este cambio, ignora este correo.',
      ].join('\n\n'),
    );
  }

  notifyChanged(email: string): Promise<void> {
    return this.deliver(
      email,
      'Tu contraseña de Cinetadel fue actualizada',
      'Tu contraseña fue actualizada y las sesiones anteriores fueron invalidadas. Si no realizaste este cambio, recupera tu cuenta desde Cinetadel y contacta con asistencia.',
    );
  }

  private async deliver(
    email: string,
    subject: string,
    text: string,
  ): Promise<void> {
    try {
      const result = await this.smtp.transport.sendMail({
        from: { name: 'Cinetadel', address: this.smtp.from },
        to: { name: '', address: email },
        subject,
        text,
      });
      if (result.rejected.length || !result.accepted.includes(email)) {
        throw new Error('SMTP recipient was not accepted.');
      }
    } catch {
      throw new Error('Password recovery email could not be sent.');
    }
  }
}
