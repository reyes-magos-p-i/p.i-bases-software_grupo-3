import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { EmployeeSessionService } from './employee-session.service';
import { EmployeeSessionOriginGuard } from './guards/employee-session-origin.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let auth: { register: jest.Mock; loginEmployee: jest.Mock };
  let session: { write: jest.Mock; clear: jest.Mock };
  const response = {} as Response;

  beforeEach(async () => {
    auth = { register: jest.fn(), loginEmployee: jest.fn() };
    session = { write: jest.fn(), clear: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: EmployeeSessionService, useValue: session },
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
});
