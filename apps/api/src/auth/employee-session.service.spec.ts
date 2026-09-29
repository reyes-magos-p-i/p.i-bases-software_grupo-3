import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  EmployeeSessionService,
  EMPLOYEE_SESSION_COOKIE,
  EMPLOYEE_SESSION_TTL_SECONDS,
} from './employee-session.service';

describe('EmployeeSessionService', () => {
  function settings(values: Record<string, unknown> = {}) {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }
  const jwt = new JwtService({ secret: 'session-test-secret' });
  const create = (
    origin: unknown = 'https://cinema.example',
    mode: unknown = 'production',
  ) =>
    new EmployeeSessionService(
      settings({ FRONTEND_URL: origin, NODE_ENV: mode }),
      jwt,
    );
  const request = (cookies?: unknown, authorization?: string) =>
    ({ cookies, headers: { authorization } }) as Request;

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['https://cinema.example', 'production', true],
    ['http://localhost:5173', 'development', false],
  ])('clears the same cookie scope for %s', (origin, mode, secure) => {
    const clearCookie = jest.fn();
    create(origin, mode).clear({ clearCookie } as unknown as Response);
    expect(clearCookie).toHaveBeenCalledWith(EMPLOYEE_SESSION_COOKIE, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api',
    });
  });

  it.each([
    ['https://cinema.example', 'production', true],
    ['https://159.54.166.238', 'production', true],
    ['https://localhost:5173/', 'development', true],
    ['http://localhost:5173', 'development', false],
    ['http://127.0.0.1:5173', 'test', false],
    ['http://[::1]:5173', 'development', false],
  ])('sets cookie attributes for %s in %s', (origin, mode, secure) => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const session = create(origin, mode);
    const token = jwt.sign(
      { sub: 21, type: 'employee' },
      { expiresIn: EMPLOYEE_SESSION_TTL_SECONDS },
    );
    const cookie = jest.fn();
    session.write({ cookie } as unknown as Response, token);
    expect(session.allowedOrigin).toBe(new URL(origin).origin);
    expect(cookie).toHaveBeenCalledWith(EMPLOYEE_SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api',
      maxAge: 86_400_000,
      expires: new Date(now + 86_400_000),
    });
  });

  it.each([
    [null, 'production'],
    [123, 'production'],
    ['', 'production'],
    ['invalid', 'production'],
    ['http://cinema.example', 'development'],
    ['http://localhost:5173', 'production'],
    ['http://localhost:5173', undefined],
    ['http://localhost.evil.example', 'test'],
    ['ftp://cinema.example', 'production'],
    ['https://user@cinema.example', 'production'],
    ['https://user:secret@cinema.example', 'production'],
    ['https://cinema.example/api', 'production'],
    ['https://cinema.example?query=1', 'production'],
    ['https://cinema.example#fragment', 'production'],
  ])(
    'rejects unsafe or invalid frontend configuration: %p (%p)',
    (origin, mode) => {
      expect(
        () =>
          new EmployeeSessionService(
            settings({ FRONTEND_URL: origin, NODE_ENV: mode }),
            jwt,
          ),
      ).toThrow();
    },
  );

  it('requires FRONTEND_URL even when no environment is set', () => {
    expect(() => new EmployeeSessionService(settings(), jwt)).toThrow(
      'FRONTEND_URL',
    );
  });

  it('uses the remaining JWT lifetime instead of extending it when writing the cookie', () => {
    const now = 1_800_000_000_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const token = jwt.sign(
      { sub: 21, type: 'employee' },
      { expiresIn: EMPLOYEE_SESSION_TTL_SECONDS },
    );
    clock.mockReturnValue(now + 5_000);
    const cookie = jest.fn();
    create().write({ cookie } as unknown as Response, token);
    expect(cookie).toHaveBeenCalledWith(
      EMPLOYEE_SESSION_COOKIE,
      token,
      expect.objectContaining({
        maxAge: 86_395_000,
        expires: new Date(now + 86_400_000),
      }),
    );
  });

  it.each([
    null,
    'text',
    {},
    { exp: '123' },
    { exp: 1.5 },
    { exp: 0 },
    { exp: Number.MAX_SAFE_INTEGER },
  ])('refuses to write a cookie with invalid expiration: %p', (payload) => {
    jest.spyOn(jwt, 'decode').mockReturnValue(payload);
    const cookie = jest.fn();
    expect(() =>
      create().write({ cookie } as unknown as Response, 'token'),
    ).toThrow('Invalid employee session expiration.');
    expect(cookie).not.toHaveBeenCalled();
  });

  it('extracts a cookie token and falls back to Bearer only when the cookie is absent', () => {
    const session = create();
    expect(
      session.extractToken(
        request({ [EMPLOYEE_SESSION_COOKIE]: 'cookie-token' }),
      ),
    ).toBe('cookie-token');
    expect(session.extractToken(request({}, 'Bearer header-token'))).toBe(
      'header-token',
    );
    expect(session.extractToken(request())).toBeNull();
    expect(session.hasCookie(request(null))).toBe(false);
    expect(session.hasCookie(request('text'))).toBe(false);
  });

  it.each([
    'Bearer cookie-token',
    'Bearer different-token',
    'Basic invalid',
    '',
  ])(
    'rejects a cookie combined with any Authorization header: %p',
    (authorization) => {
      expect(
        create().extractToken(
          request({ [EMPLOYEE_SESSION_COOKIE]: 'cookie-token' }, authorization),
        ),
      ).toBeNull();
    },
  );

  it.each(['', null, 123, {}, [], undefined])(
    'rejects a malformed cookie without falling back to Bearer: %p',
    (value) => {
      const session = create();
      expect(
        session.extractToken(request({ [EMPLOYEE_SESSION_COOKIE]: value })),
      ).toBeNull();
      expect(
        session.extractToken(
          request({ [EMPLOYEE_SESSION_COOKIE]: value }, 'Bearer valid-token'),
        ),
      ).toBeNull();
    },
  );
});
