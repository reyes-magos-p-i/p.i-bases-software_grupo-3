import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { EmployeeSessionService } from './employee-session.service';
import { EmployeeSessionOriginGuard } from './guards/employee-session-origin.guard';
import { ClientsService } from '../clients/clients.service';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common/exceptions/index.js';

describe('AuthController', () => {
  let controller: AuthController;
  let auth: {
    register: jest.Mock;
    confirmEmailVerification: jest.Mock;
    resendEmailVerification: jest.Mock;
    loginEmployee: jest.Mock;
    facebookLogin: jest.Mock;
  };
  let session: { write: jest.Mock; clear: jest.Mock };
  let clients: { changePassword: jest.Mock };

  const response = {} as Response;

  beforeEach(async () => {
    auth = {
      register: jest.fn(),
      confirmEmailVerification: jest.fn(),
      resendEmailVerification: jest.fn(),
      loginEmployee: jest.fn(),
      facebookLogin: jest.fn(),
    };
    session = { write: jest.fn(), clear: jest.fn() };
    clients = { changePassword: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: EmployeeSessionService, useValue: session },
        { provide: ClientsService, useValue: clients },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmployeeSessionOriginGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('register() delegates to AuthService.register', async () => {
    const dto = { email: 'a@b.com' } as never;
    auth.register.mockResolvedValue({ id: 1, email: 'a@b.com' });

    const result = await controller.register(dto);

    expect(auth.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 1, email: 'a@b.com' });
  });

  it('confirms client email and returns the client session', async () => {
    const result = { accessToken: 'client-token', client: { id: 1 } };
    auth.confirmEmailVerification.mockResolvedValue(result);

    await expect(
      controller.confirmEmail({ token: 'a'.repeat(64) }),
    ).resolves.toEqual(result);
    expect(auth.confirmEmailVerification).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('resends client email verification', async () => {
    const dto = { email: 'client@example.com' };
    auth.resendEmailVerification.mockResolvedValue({ message: 'sent' });

    await expect(controller.resendEmailVerification(dto)).resolves.toEqual({
      message: 'sent',
    });
    expect(auth.resendEmailVerification).toHaveBeenCalledWith(dto.email);
  });

  it('facebookLogin() delegates the access token and returns the service result', async () => {
    const dto = { accessToken: 'facebook-access-token' };
    const result = { accessToken: 'signed-token' };
    auth.facebookLogin.mockResolvedValue(result);

    await expect(controller.facebookLogin(dto)).resolves.toEqual(result);

    expect(auth.facebookLogin).toHaveBeenCalledTimes(1);
    expect(auth.facebookLogin).toHaveBeenCalledWith(dto.accessToken);
  });

  it('facebookLogin() propagates authentication failures', async () => {
    const failure = new Error('Invalid Facebook access token');
    auth.facebookLogin.mockRejectedValue(failure);

    await expect(
      controller.facebookLogin({ accessToken: 'facebook-access-token' }),
    ).rejects.toBe(failure);
  });

  it('loginEmployee() writes the cookie and returns only the user profile', async () => {
    const dto = { email: 'staff@example.com', password: ' Password ' };
    const result = {
      accessToken: 'test-token',
      user: { id: 21, role: 'EMPLOYEE' },
    };
    auth.loginEmployee.mockResolvedValue(result);
    await expect(controller.loginEmployee(dto, response)).resolves.toEqual({
      user: result.user,
    });
    expect(session.write).toHaveBeenCalledWith(response, result.accessToken);
    expect(auth.loginEmployee).toHaveBeenCalledTimes(1);
    expect(auth.loginEmployee).toHaveBeenCalledWith(dto);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('propagates login failures to the HTTP exception handler', async () => {
    const failure = new Error('Login failed');
    auth.loginEmployee.mockRejectedValue(failure);
    await expect(
      controller.loginEmployee(
        {
          email: 'staff@example.com',
          password: 'password',
        },
        response,
      ),
    ).rejects.toBe(failure);
    expect(session.write).not.toHaveBeenCalled();
  });

  it('me() returns the authenticated user from the request', () => {
    const req = { user: { id: 1, email: 'a@b.com' } } as never;

    expect(controller.me(req)).toEqual({ id: 1, email: 'a@b.com' });
  });

  it('logout clears the cookie without requiring credentials', () => {
    expect(controller.logoutEmployee(response)).toBeUndefined();
    expect(session.clear).toHaveBeenCalledWith(response);
    expect(auth.loginEmployee).not.toHaveBeenCalled();
  });


  describe('passwordStatus()', () => {
  it('returns the status attached to the request', () => {
    const req = { passwordStatus: 'valid' } as never;
    expect(controller.passwordStatus(req)).toEqual({ status: 'valid' });
  });

  it('throws when the status was never computed', () => {
    const req = {} as never;
    expect(() => controller.passwordStatus(req)).toThrow(InternalServerErrorException);
  });
});

  describe('changeClientPassword()', () => {
    it('rejects employee tokens', async () => {
      const req = { accountType: 'employee' } as never;
      await expect(
        controller.changeClientPassword(req, {
          newPassword: 'x',
          confirmNewPassword: 'x',
          expirationDays: 90,
        } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(clients.changePassword).not.toHaveBeenCalled();
    });

    it('delegates to ClientsService for client tokens', async () => {
      const req = {
        accountType: 'client',
        user: { id: 1, email: 'a@b.com', firstName: 'Ana' },
      } as never;
      const dto = { newPassword: 'x', confirmNewPassword: 'x', expirationDays: 90 } as never;

      await expect(controller.changeClientPassword(req, dto)).resolves.toEqual({
        message: expect.any(String),
      });
      expect(clients.changePassword).toHaveBeenCalledWith(1, 'a@b.com', 'Ana', dto);
    });
  });
});
