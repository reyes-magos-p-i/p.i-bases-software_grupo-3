import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { EmployeeSessionService } from '../employee-session.service';
import { ClientsService } from '../../clients/clients.service';
import { UsersRepository } from '../../users/users.repository';
import { computePasswordStatus } from '../password/password-status';

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

    if (payload.type === 'employee') {
      const employee = await this.users.findEmployeeIdentityById(payload.sub);
      if (!employee) throw new UnauthorizedException();
      const credentials = await this.users.findEmployeeCredentialsStatus(
        employee.id,
      );
      request.passwordStatus = computePasswordStatus(credentials);
      request.accountType = 'employee';
      return employee;
    }
    
    const client = await this.clients.findById(payload.sub);
    if (!client) throw new UnauthorizedException();
    if (await this.clients.isEmailVerificationPending(payload.sub)) {
      throw new UnauthorizedException();
    }

    const credentials = await this.clients.findPasswordStatus(client.id);
    request.passwordStatus = computePasswordStatus(credentials);
    request.accountType = 'client';
    return client;
  }
}