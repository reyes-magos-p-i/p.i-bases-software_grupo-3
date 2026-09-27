import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
 
describe('AuthController', () => {
  let controller: AuthController;
  let auth: { register: jest.Mock };
 
  beforeEach(async () => {
    auth = { register: jest.fn() };
 
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
 
  it('me() returns the authenticated user from the request', () => {
    const req = { user: { id: 1, email: 'a@b.com' } } as never;
 
    expect(controller.me(req)).toEqual({ id: 1, email: 'a@b.com' });
  });
});