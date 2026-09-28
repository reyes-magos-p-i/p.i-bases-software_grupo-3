import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole } from '../enums/user-role.enum';
import type { UserIdentity } from '../types/user-identity.type';
import { UsersRepository } from '../users.repository';
import { DevelopmentAdminGuard } from './development-admin.guard';

describe('DevelopmentAdminGuard', () => {
  let module: TestingModule;
  let guard: DevelopmentAdminGuard;
  let settings: Record<string, unknown>;
  let httpRequest: { user?: UserIdentity; body?: unknown; headers?: unknown };
  const repository = { findEmployeeIdentityById: jest.fn() };
  const context = {
    switchToHttp: () => ({ getRequest: () => httpRequest }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    settings = {
      NODE_ENV: 'development',
      DEV_ADMIN_ENABLED: 'true',
      DEV_ADMIN_EMPLOYEE_ID: '21',
    };
    httpRequest = {};
    repository.findEmployeeIdentityById.mockReset().mockResolvedValue({
      id: 21,
      role: UserRole.ADMINISTRATOR,
    });
    module = await Test.createTestingModule({
      providers: [
        DevelopmentAdminGuard,
        { provide: UsersRepository, useValue: repository },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    }).compile();
    guard = module.get(DevelopmentAdminGuard);
  });

  afterEach(async () => {
    await module.close();
  });

  it('attaches only the configured administrator identity', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: UserRole.ADMINISTRATOR,
      email: 'private@example.com',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(repository.findEmployeeIdentityById).toHaveBeenCalledTimes(1);
    expect(repository.findEmployeeIdentityById).toHaveBeenCalledWith(21);
    expect(httpRequest.user).toEqual({ id: 21, role: UserRole.ADMINISTRATOR });
  });

  it('uses the configured ID without a hardcoded administrator', async () => {
    settings.DEV_ADMIN_EMPLOYEE_ID = '42';
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 42,
      role: UserRole.ADMINISTRATOR,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(repository.findEmployeeIdentityById).toHaveBeenCalledWith(42);
    expect(httpRequest.user?.id).toBe(42);
  });

  it.each([undefined, '', 'production', 'test', 'Development'])(
    'denies NODE_ENV=%p without querying Oracle',
    async (value) => {
      settings.NODE_ENV = value;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findEmployeeIdentityById).not.toHaveBeenCalled();
      expect(httpRequest.user).toBeUndefined();
    },
  );

  it.each([undefined, '', 'false', 'TRUE', '1', true])(
    'requires explicit string activation, received %p',
    async (value) => {
      settings.DEV_ADMIN_ENABLED = value;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findEmployeeIdentityById).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    '',
    '0',
    '-1',
    '1.5',
    '21junk',
    ' 21 ',
    '2e1',
    'Infinity',
    'NaN',
    '9007199254740992',
    21,
    true,
  ])(
    'rejects an invalid configured ID %p before querying Oracle',
    async (value) => {
      settings.DEV_ADMIN_EMPLOYEE_ID = value;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findEmployeeIdentityById).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { id: 21, role: UserRole.EMPLOYEE },
    { id: 21, role: UserRole.CLIENT },
    { id: 42, role: UserRole.ADMINISTRATOR },
  ])('denies an absent or unauthorized identity %p', async (identity) => {
    repository.findEmployeeIdentityById.mockResolvedValue(identity);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'No tiene permiso para crear usuarios.',
    );
    expect(httpRequest.user).toBeUndefined();
  });

  it('does not trust identities supplied in the request', async () => {
    httpRequest = {
      user: { id: 999, role: UserRole.ADMINISTRATOR },
      body: { role: 'ADMINISTRATOR', employeeId: 999 },
      headers: { 'x-user-id': '999', 'x-user-role': 'ADMINISTRATOR' },
    };
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(httpRequest.user).toEqual({ id: 21, role: UserRole.ADMINISTRATOR });
    repository.findEmployeeIdentityById.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechecks the database role for every request', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: UserRole.EMPLOYEE,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.findEmployeeIdentityById).toHaveBeenCalledTimes(2);
  });

  it('propagates database failures without granting access', async () => {
    const error = new Error('Database unavailable');
    repository.findEmployeeIdentityById.mockRejectedValue(error);
    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(httpRequest.user).toBeUndefined();
  });
});
