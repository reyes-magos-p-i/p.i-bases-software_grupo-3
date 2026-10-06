import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordStatusGuard } from './password-status.guard';

describe('PasswordStatusGuard', () => {
  let guard: PasswordStatusGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const buildContext = (passwordStatus?: string): ExecutionContext => {
    const request: Record<string, unknown> = { passwordStatus };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PasswordStatusGuard(reflector as unknown as Reflector);
  });

  it('allows routes marked with @AllowExpiredPassword regardless of status', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(buildContext('expired'))).toBe(true);
  });

  it('rejects when the password status was never computed', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('rejects an expired password with the PASSWORD_EXPIRED code', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    try {
      guard.canActivate(buildContext('expired'));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PASSWORD_EXPIRED',
      });
    }
  });

  it('rejects a password that was never set with the PASSWORD_MUST_SET code', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    try {
      guard.canActivate(buildContext('must_set'));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PASSWORD_MUST_SET',
      });
    }
  });

  it('allows a valid password through', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(buildContext('valid'))).toBe(true);
  });
});