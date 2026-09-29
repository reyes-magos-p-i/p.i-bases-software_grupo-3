import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UserRole } from '../enums/user-role.enum';
import type { UserIdentity } from '../types/user-identity.type';
import { UsersRepository } from '../users.repository';

@Injectable()
export class DevelopmentAdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configuredId = this.config.get<unknown>('DEV_ADMIN_EMPLOYEE_ID');
    if (
      this.config.get<unknown>('NODE_ENV') !== 'development' ||
      this.config.get<unknown>('DEV_ADMIN_ENABLED') !== 'true' ||
      typeof configuredId !== 'string' ||
      !/^[1-9]\d*$/u.test(configuredId)
    ) {
      throw new ForbiddenException('No tiene permiso para crear usuarios.');
    }

    const employeeId = Number(configuredId);
    if (!Number.isSafeInteger(employeeId)) {
      throw new ForbiddenException('No tiene permiso para crear usuarios.');
    }

    const identity =
      await this.usersRepository.findEmployeeIdentityById(employeeId);
    if (
      identity?.id !== employeeId ||
      identity.role !== UserRole.ADMINISTRATOR
    ) {
      throw new ForbiddenException('No tiene permiso para crear usuarios.');
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: UserIdentity }>();
    request.user = { id: identity.id, role: identity.role };
    return true;
  }
}
