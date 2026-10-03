import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { EmployeeSessionService } from '../employee-session.service';
import { ClientsService } from '../../clients/clients.service';
import { UsersRepository } from '../../users/users.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly clients: ClientsService,
    private readonly users: UsersRepository,
    private readonly session: EmployeeSessionService,
  ) {
    super({
      jwtFromRequest: (request: Request) => session.extractToken(request),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: unknown) {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      !('sub' in payload) ||
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub < 1 ||
      !('type' in payload) ||
      (payload.type !== 'client' && payload.type !== 'employee')
    ) {
      throw new UnauthorizedException();
    }

    if (this.session.hasCookie(request) && payload.type !== 'employee') {
      throw new UnauthorizedException();
    }

    const user =
      payload.type === 'employee'
        ? await this.users.findEmployeeIdentityById(payload.sub)
        : await this.clients.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    if (
      payload.type === 'client' &&
      (await this.clients.isEmailVerificationPending(payload.sub))
    ) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
