import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ClientsService } from '../../clients/clients.service';
import { UsersRepository } from '../../users/users.repository';
import { UserRole } from '../../users/enums/user-role.enum';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import {
  EmployeeSessionService,
  EMPLOYEE_SESSION_COOKIE,
} from '../employee-session.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let clients: {
    findById: jest.Mock;
    isEmailVerificationPending: jest.Mock;
    findPasswordStatus: jest.Mock;
  };
  let users: { findEmployeeIdentityById: jest.Mock };
  const request = { headers: {} } as Request;

  beforeEach(async () => {
    clients = {
      findById: jest.fn(),
      isEmailVerificationPending: jest.fn().mockResolvedValue(false),
      findPasswordStatus: jest.fn().mockResolvedValue(null),
    };
    users = { findEmployeeIdentityById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        EmployeeSessionService,
        JwtService,
        { provide: ClientsService, useValue: clients },
        { provide: UsersRepository, useValue: users },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn(() => 'mock-secret'),
            get: (key: string) =>
              ({ FRONTEND_URL: 'https://cinema.example', NODE_ENV: 'test' })[
                key
              ],
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it.each([
    null,
    undefined,
    [],
    'token',
    1,
    {},
    { sub: 1 },
    { type: 'employee' },
    { sub: '1', type: 'employee' },
    { sub: 0, type: 'employee' },
    { sub: -1, type: 'employee' },
    { sub: 1.5, type: 'employee' },
    { sub: Number.MAX_SAFE_INTEGER + 1, type: 'employee' },
    { sub: NaN, type: 'client' },
    { sub: Infinity, type: 'client' },
    { sub: 1, type: 'administrator' },
    { sub: 1, type: null },
  ])(
    'rejects an invalid payload before accessing persistence: %p',
    async (payload) => {
      await expect(strategy.validate(request, payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(clients.findById).not.toHaveBeenCalled();
      expect(users.findEmployeeIdentityById).not.toHaveBeenCalled();
    },
  );

  it('rejects when the client no longer exists', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(
      strategy.validate(request, { sub: 1, type: 'client' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the client when the token is valid and the client still exists', async () => {
    const client = { id: 1, email: 'ana@example.com' };
    clients.findById.mockResolvedValue(client);

    await expect(
      strategy.validate(request, { sub: 1, type: 'client' }),
    ).resolves.toEqual(client);
    expect(clients.findById).toHaveBeenCalledWith(1);
    expect(clients.isEmailVerificationPending).toHaveBeenCalledWith(1);
    expect(users.findEmployeeIdentityById).not.toHaveBeenCalled();
  });

  it('rejects an otherwise valid client token while email confirmation is pending', async () => {
    clients.findById.mockResolvedValue({ id: 1, email: 'ana@example.com' });
    clients.isEmailVerificationPending.mockResolvedValue(true);

    await expect(
      strategy.validate(request, { sub: 1, type: 'client' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
    'uses the current database role %s instead of a role claim',
    async (role) => {
      users.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role,
        firstName: 'Ana',
      });
      await expect(
        strategy.validate(request, {
          sub: 21,
          type: 'employee',
          role: 'CLIENT',
        }),
      ).resolves.toEqual({ id: 21, role, firstName: 'Ana' });
      expect(users.findEmployeeIdentityById).toHaveBeenCalledWith(21);
      expect(clients.findById).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing or invalid employee identity', async () => {
    users.findEmployeeIdentityById.mockResolvedValue(null);
    await expect(
      strategy.validate(request, { sub: 21, type: 'employee' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a client token from the employee cookie before querying persistence', async () => {
    const cookieRequest = {
      headers: {},
      cookies: { [EMPLOYEE_SESSION_COOKIE]: 'client-token' },
    } as unknown as Request;
    await expect(
      strategy.validate(cookieRequest, { sub: 21, type: 'client' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(clients.findById).not.toHaveBeenCalled();
    expect(users.findEmployeeIdentityById).not.toHaveBeenCalled();
  });

  it('reads employee identity on each validation so role changes are reflected', async () => {
    const payload = { sub: 21, type: 'employee' };
    users.findEmployeeIdentityById
      .mockResolvedValueOnce({
        id: 21,
        role: UserRole.ADMINISTRATOR,
        firstName: 'Ana',
      })
      .mockResolvedValueOnce({
        id: 21,
        role: UserRole.EMPLOYEE,
        firstName: 'Ana',
      });
    await expect(strategy.validate(request, payload)).resolves.toHaveProperty(
      'role',
      UserRole.ADMINISTRATOR,
    );
    await expect(strategy.validate(request, payload)).resolves.toHaveProperty(
      'role',
      UserRole.EMPLOYEE,
    );
    expect(users.findEmployeeIdentityById).toHaveBeenCalledTimes(2);
  });

  it.each(['client', 'employee'])(
    'propagates persistence failures for %s',
    async (type) => {
      const failure = new Error('Database unavailable');
      clients.findById.mockRejectedValue(failure);
      users.findEmployeeIdentityById.mockRejectedValue(failure);
      await expect(strategy.validate(request, { sub: 1, type })).rejects.toBe(
        failure,
      );
    },
  );
});
