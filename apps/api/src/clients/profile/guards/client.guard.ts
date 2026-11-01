import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class ClientGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.accountType !== 'client') {
      throw new ForbiddenException(
        'Esta función está disponible únicamente para clientes.',
      );
    }
    return true;
  }
}
