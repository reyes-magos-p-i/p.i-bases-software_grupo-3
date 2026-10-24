import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isEmail } from 'class-validator';
import { EmailVerificationSender } from '../../auth/notifications/email-verification-sender';
import { ClientsRepository } from '../clients.repository';

const AUDIENCE = 'client-email-change';
const EXPIRY_MINUTES = 30;
const INVALID_LINK =
  'El enlace venció o ya no es válido. Solicita otro cambio de correo desde tu perfil.';

interface EmailChangeClaims {
  sub: number;
  purpose: typeof AUDIENCE;
  email: string;
  newEmail: string;
  sessionVersion: string | null;
}

@Injectable()
export class ClientEmailChangeService {
  constructor(
    private readonly clients: ClientsRepository,
    private readonly jwt: JwtService,
    private readonly sender: EmailVerificationSender,
    private readonly config: ConfigService,
  ) {}

  async request(id: number, newEmail: string): Promise<void> {
    const current = await this.clients.getEmailChangeSnapshot(id);
    if (!current)
      throw new UnauthorizedException(
        'Tu sesión terminó. Inicia sesión nuevamente.',
      );
    if (current.email === newEmail)
      throw new BadRequestException('Escribe un correo diferente al actual.');
    if (await this.clients.isClientEmailTaken(newEmail, id))
      throw new ConflictException(
        'Ese correo ya está registrado para otro cliente.',
      );
    const token = await this.jwt.signAsync(
      { sub: id, purpose: AUDIENCE, ...current, newEmail },
      {
        audience: AUDIENCE,
        algorithm: 'HS256',
        expiresIn: EXPIRY_MINUTES * 60,
      },
    );
    const url = new URL(
      '/account/confirm-email',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    url.hash = token;
    try {
      await this.sender.send({
        email: newEmail,
        confirmationUrl: url.toString(),
        expiresInMinutes: EXPIRY_MINUTES,
        purpose: 'email-change',
      });
    } catch {
      throw new ServiceUnavailableException(
        'No pudimos enviar el correo de confirmación. Tu correo actual se mantiene. Intenta nuevamente.',
      );
    }
  }

  async confirm(token: string): Promise<{ clientId: number }> {
    const claims = await this.readClaims(token);
    await this.clients.confirmEmailChange(
      claims.sub,
      claims.email,
      claims.newEmail,
      claims.sessionVersion,
    );
    return { clientId: claims.sub };
  }

  private async readClaims(token: string): Promise<EmailChangeClaims> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      throw new BadRequestException(INVALID_LINK);
    }
    if (!this.validClaims(payload)) throw new BadRequestException(INVALID_LINK);
    return payload;
  }

  private validClaims(value: unknown): value is EmailChangeClaims {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const claims = value as Record<string, unknown>;
    return (
      Number.isSafeInteger(claims.sub) &&
      Number(claims.sub) > 0 &&
      claims.purpose === AUDIENCE &&
      !('type' in claims) &&
      this.validEmail(claims.email) &&
      this.validEmail(claims.newEmail) &&
      claims.email !== claims.newEmail &&
      (claims.sessionVersion === null ||
        (typeof claims.sessionVersion === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}$/u.test(
            claims.sessionVersion,
          )))
    );
  }
  private validEmail(email: unknown): email is string {
    return (
      typeof email === 'string' &&
      Buffer.byteLength(email, 'utf8') <= 150 &&
      !/[\uD800-\uDFFF]/u.test(email) &&
      isEmail(email)
    );
  }
}
