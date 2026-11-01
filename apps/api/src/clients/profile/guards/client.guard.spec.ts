import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClientGuard } from './client.guard';

describe('ClientGuard', () => {
  const context = (accountType?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ accountType }) }),
    }) as ExecutionContext;
  it('allows an authenticated client', () => {
    expect(new ClientGuard().canActivate(context('client'))).toBe(true);
  });
  it.each(['employee', undefined, 'administrator'])('rejects %p', (type) => {
    expect(() => new ClientGuard().canActivate(context(type))).toThrow(
      ForbiddenException,
    );
  });
});
