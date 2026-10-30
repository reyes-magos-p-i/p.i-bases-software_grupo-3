import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PasswordHasher } from '../common/security/password-hasher';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordRecoveryRepository } from './password-recovery.repository';
import { PasswordRecoverySender } from './notifications/password-recovery-sender';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { validatePasswordChange } from './password/password-change-validator';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly repository: PasswordRecoveryRepository,
    private readonly hasher: PasswordHasher,
    private readonly generator: PasswordGenerator,
    private readonly sender: PasswordRecoverySender,
    private readonly config: ConfigService,
  ) {}

  async request(input: RequestPasswordRecoveryDto) {
    const token = randomBytes(32).toString('hex');
    const temporaryPassword = this.generator.generate();
    const { passwordHash } = await this.hasher.hash(temporaryPassword);
    const tokenHash = this.hashToken(token);
    const account = await this.repository.request(
      input.accountType,
      input.email,
      tokenHash,
      passwordHash,
    );
    if (account) {
      const url = new URL(
        '/recover-password',
        this.config.getOrThrow<string>('FRONTEND_URL'),
      );
      // Fragments do not reach HTTP access logs or referrer headers.
      url.hash = token;
      try {
        await this.sender.send({
          email: account.EMAIL,
          recoveryUrl: url.toString(),
          temporaryPassword,
          expiresInMinutes: 30,
        });
      } catch {
        await this.repository.invalidate(tokenHash);
        this.logger.warn('Password recovery email delivery failed.');
      }
    }
    return {
      message:
        'Si existe una cuenta habilitada con ese correo, recibirás las instrucciones para recuperar tu contraseña.',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'ascii').digest('hex');
  }

  private invalid(): never {
    throw new BadRequestException({
      code: 'RECOVERY_INVALID',
      message:
        'El enlace venció o ya no es válido. Solicita una nueva recuperación.',
    });
  }

  private async recovery(token: string) {
    const recovery = await this.repository.find(this.hashToken(token));
    if (!recovery) this.invalid();
    return recovery;
  }

  async validate(token: string) {
    const recovery = await this.recovery(token);
    return {
      accountType: recovery.accountType,
      expiresAt: recovery.expiresAt.toISOString(),
    };
  }

  async reset(input: ResetPasswordDto) {
    const recovery = await this.recovery(input.token);
    if (
      !(await this.hasher.verify(
        input.temporaryPassword,
        recovery.temporaryHash,
      ))
    ) {
      await this.repository.failAttempt(recovery.tokenHash);
      throw new BadRequestException({
        code: 'TEMPORARY_PASSWORD_INCORRECT',
        message:
          'La contraseña temporal no es correcta. Revisa el correo recibido.',
      });
    }
    await validatePasswordChange(
      input,
      { email: recovery.EMAIL, firstName: recovery.FIRST_NAME },
      () => this.hasher.verify(input.newPassword, recovery.PASSWORD_HASH),
    );
    const credentials = await this.hasher.hash(input.newPassword);
    if (
      !(await this.repository.complete(
        recovery,
        credentials,
        input.expirationDays,
      ))
    )
      this.invalid();
    try {
      await this.sender.notifyChanged(recovery.EMAIL);
    } catch {
      // The committed password change must not appear to have failed because of SMTP.
      this.logger.warn('Password change notification delivery failed.');
    }
    return {
      message:
        'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
    };
  }
}
