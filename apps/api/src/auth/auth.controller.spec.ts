import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
 
describe('AuthController', () => {
  let controller: AuthController;
  let auth: { register: jest.Mock; loginEmployee: jest.Mock };
 
  beforeEach(async () => {
    auth = { register: jest.fn(), loginEmployee: jest.fn() };
 
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
 
    controller = module.get<AuthController>(AuthController);
  });
 
  it('register() delegates to AuthService.register', async () => {
    const dto = { email: 'a@b.com' } as never;
    auth.register.mockResolvedValue({ id: 1, email: 'a@b.com' });
 
    const result = await controller.register(dto);
 
    expect(auth.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 1, email: 'a@b.com' });
  });
 
  it('loginEmployee() delegates credentials and returns the service result', async () => {
    const dto = { email: 'staff@example.com', password: ' Password ' };
    const result = { accessToken: 'test-token', user: { id: 21, role: 'EMPLOYEE' } };
    auth.loginEmployee.mockResolvedValue(result);
    await expect(controller.loginEmployee(dto)).resolves.toBe(result);
    expect(auth.loginEmployee).toHaveBeenCalledTimes(1);
    expect(auth.loginEmployee).toHaveBeenCalledWith(dto);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('propagates login failures to the HTTP exception handler', async () => {
    const failure = new Error('Login failed');
    auth.loginEmployee.mockRejectedValue(failure);
    await expect(controller.loginEmployee({ email: 'staff@example.com', password: 'password' })).rejects.toBe(failure);
  });

  it('me() returns the authenticated user from the request', () => {
    const req = { user: { id: 1, email: 'a@b.com' } } as never;
 
    expect(controller.me(req)).toEqual({ id: 1, email: 'a@b.com' });
  });
});
