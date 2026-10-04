import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class AdministratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (
      typeof user !== 'object' ||
      user === null ||
      !('role' in user) ||
      user.role !== UserRole.ADMINISTRATOR
    ) {
      throw new ForbiddenException(
        'No tiene permiso para realizar esta acción.',
      );
    }
    return true;
  }
}
