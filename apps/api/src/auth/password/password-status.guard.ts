import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_EXPIRED_PASSWORD_KEY } from './allow-expired-password.decorator';

@Injectable()
export class PasswordStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_EXPIRED_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const status = request.passwordStatus;

    if (status === undefined) {
      // JWT failsafe validation if the password status is unknown, so we must reject the request.
      throw new ForbiddenException('Password status is unknown.');
    }
    if (status === 'expired') {
      throw new ForbiddenException({
        code: 'PASSWORD_EXPIRED',
        message: 'Tu contraseña venció. Actualízala para continuar.',
      });
    }
    if (status === 'must_set') {
      throw new ForbiddenException({
        code: 'PASSWORD_MUST_SET',
        message: 'Debes configurar una contraseña para continuar.',
      });
    }
    return true;
  }
}