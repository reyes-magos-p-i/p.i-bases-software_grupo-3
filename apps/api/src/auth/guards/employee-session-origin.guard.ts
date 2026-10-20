import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { EmployeeSessionService } from '../employee-session.service';

@Injectable()
export class EmployeeSessionOriginGuard implements CanActivate {
  constructor(private readonly session: EmployeeSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.origin !== this.session.allowedOrigin) {
      throw new ForbiddenException(
        'El origen de la solicitud no está autorizado.',
      );
    }
    return true;
  }
}
