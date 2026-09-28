import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';
import { ExtractJwt } from 'passport-jwt';

export const EMPLOYEE_SESSION_COOKIE = 'cinetadel_employee_session';
export const EMPLOYEE_SESSION_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class EmployeeSessionService {
  readonly allowedOrigin: string;
  private readonly cookieOptions: CookieOptions;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    const configuredOrigin = config.get<unknown>('FRONTEND_URL');
    const mode = config.get<unknown>('NODE_ENV');
    let url: URL;
    try {
      if (typeof configuredOrigin !== 'string') throw new Error();
      url = new URL(configuredOrigin);
    } catch {
      throw new Error('FRONTEND_URL must contain a valid frontend origin.');
    }
    const localHttp =
      (mode === 'development' || mode === 'test') &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'FRONTEND_URL must be an HTTPS origin; HTTP is only allowed for local development or tests.',
      );
    }
    this.allowedOrigin = url.origin;
    this.cookieOptions = {
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'strict',
      path: '/api',
    };
  }

  hasCookie(request: Request): boolean {
    const cookies: unknown = request.cookies;
    return (
      typeof cookies === 'object' &&
      cookies !== null &&
      Object.hasOwn(cookies, EMPLOYEE_SESSION_COOKIE)
    );
  }

  extractToken(request: Request): string | null {
    if (!this.hasCookie(request)) {
      return ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    }
    // Reject dual credentials even when they contain the same token.
    if (request.headers.authorization !== undefined) return null;
    const cookie: unknown = request.cookies[EMPLOYEE_SESSION_COOKIE];
    return typeof cookie === 'string' && cookie.length > 0 ? cookie : null;
  }

  write(response: Response, accessToken: string): void {
    // The token was issued internally; its expiry keeps cookie and JWT lifetimes aligned.
    const payload: unknown = this.jwt.decode(accessToken);
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('exp' in payload) ||
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp)
    ) {
      throw new Error('Invalid employee session expiration.');
    }
    const remaining = payload.exp * 1000 - Date.now();
    if (remaining <= 0 || remaining > EMPLOYEE_SESSION_TTL_SECONDS * 1000) {
      throw new Error('Invalid employee session expiration.');
    }
    response.cookie(EMPLOYEE_SESSION_COOKIE, accessToken, {
      ...this.cookieOptions,
      maxAge: remaining,
      expires: new Date(payload.exp * 1000),
    });
  }

  clear(response: Response): void {
    response.clearCookie(EMPLOYEE_SESSION_COOKIE, this.cookieOptions);
  }
}
