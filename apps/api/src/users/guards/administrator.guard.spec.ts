import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdministratorGuard } from './administrator.guard';

describe('AdministratorGuard', () => {
  const guard = new AdministratorGuard();
  const context = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext;

  it('allows the authenticated administrator identity', () => {
    expect(guard.canActivate(context({ id: 21, role: 'ADMINISTRATOR' }))).toBe(
      true,
    );
  });

  it.each([
    undefined,
    null,
    'ADMINISTRATOR',
    {},
    { role: 'EMPLOYEE' },
    { role: 'CLIENT' },
  ])('rejects an unauthorized identity: %p', (user) => {
    expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(user))).toThrow(
      'No tiene permiso para realizar esta acción.',
    );
  });
});
