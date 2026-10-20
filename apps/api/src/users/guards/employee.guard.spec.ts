import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmployeeGuard } from './employee.guard';

describe('EmployeeGuard', () => {
  const guard = new EmployeeGuard();
  const context = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext;
  it.each(['EMPLOYEE', 'ADMINISTRATOR'])('allows %s', (role) => {
    expect(guard.canActivate(context({ id: 21, role }))).toBe(true);
  });
  it.each([
    undefined,
    null,
    'EMPLOYEE',
    [],
    {},
    { role: 'CLIENT' },
    { role: 'UNKNOWN' },
  ])('rejects a non-staff identity: %p', (user) => {
    expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException);
  });
});
