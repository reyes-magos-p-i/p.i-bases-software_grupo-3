import { Test, TestingModule } from '@nestjs/testing';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { EmployeeGuard } from '../users/guards/employee.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

describe('TicketsController', () => {
  let controller: TicketsController;
  let service: { findOne: jest.Mock; updateMovieFunction: jest.Mock };

  beforeEach(async () => {
    service = {
      findOne: jest.fn(),
      updateMovieFunction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: service }],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('finds a ticket through the service using the numeric id', () => {
    service.findOne.mockReturnValue('ticket');

    expect(controller.findOne('4')).toBe('ticket');
    expect(service.findOne).toHaveBeenCalledWith(4);
  });

  it('moves a ticket to another movie function through the service', async () => {
    service.updateMovieFunction.mockResolvedValue('updated');

    await expect(
      controller.updateMovieFunction('4', { movieFunctionId: 13 }),
    ).resolves.toBe('updated');
    expect(service.updateMovieFunction).toHaveBeenCalledWith(4, {
      movieFunctionId: 13,
    });
  });

  it('protects the controller with the jwt, employee and password status guards', () => {
    const guards: unknown[] = Reflect.getMetadata(
      '__guards__',
      TicketsController,
    );

    expect(guards).toHaveLength(3);
    expect(guards).toEqual(
      expect.arrayContaining([EmployeeGuard, PasswordStatusGuard]),
    );
  });
});
