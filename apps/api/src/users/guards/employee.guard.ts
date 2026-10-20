import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class EmployeeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (
      typeof user !== 'object' ||
      user === null ||
      Array.isArray(user) ||
      !('role' in user) ||
      (user.role !== UserRole.EMPLOYEE && user.role !== UserRole.ADMINISTRATOR)
    ) {
      throw new ForbiddenException(
        'No tiene permiso para realizar esta acción.',
      );
    }
    return true;
  }
}
