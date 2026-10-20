import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmployeeSessionService } from '../employee-session.service';
import { EmployeeSessionOriginGuard } from './employee-session-origin.guard';

describe('EmployeeSessionOriginGuard', () => {
  const session = new EmployeeSessionService(
    new ConfigService({
      FRONTEND_URL: 'https://cinema.example',
      NODE_ENV: 'production',
    }),
    new JwtService(),
  );
  const guard = new EmployeeSessionOriginGuard(session);
  const context = (origin: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            origin,
            host: 'cinema.example',
            referer: 'https://cinema.example/',
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts only the configured origin', () => {
    expect(guard.canActivate(context('https://cinema.example'))).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    'null',
    'invalid',
    'http://cinema.example',
    'https://cinema.example.evil.example',
    'https://cinema.example:8080',
    'https://cinema.example/',
    'https://cinema.example https://evil.example',
    ['https://cinema.example'],
  ])(
    'rejects an absent, invalid or unauthorized Origin despite Host or Referer: %p',
    (origin) => {
      expect(() => guard.canActivate(context(origin))).toThrow(
        ForbiddenException,
      );
    },
  );
});
