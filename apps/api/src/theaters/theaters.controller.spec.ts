import { Test, TestingModule } from '@nestjs/testing';
import { TheatersController } from './theaters.controller';
import { TheatersService } from './theaters.service';

describe('TheatersController', () => {
  let controller: TheatersController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TheatersController],
      providers: [{ provide: TheatersService, useValue: service }],
    }).compile();

    controller = module.get<TheatersController>(TheatersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a theater through the service', async () => {
    const theaterDto = {
      branchId: 2,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
      projectorName: 'IMAX',
    };
    service.create.mockResolvedValue({ theaterId: 7, ...theaterDto });

    await expect(controller.create(theaterDto)).resolves.toEqual({
      theaterId: 7,
      ...theaterDto,
    });
    expect(service.create).toHaveBeenCalledWith(theaterDto);
  });

  it('returns all theaters from the service', async () => {
    const theaters = [{ theaterId: 1, projectorName: 'IMAX' }];
    service.findAll.mockResolvedValue(theaters);

    await expect(controller.findAll()).resolves.toEqual(theaters);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('converts the id to a number when finding one theater', () => {
    service.findOne.mockReturnValue('theater');

    expect(controller.findOne('4')).toBe('theater');
    expect(service.findOne).toHaveBeenCalledWith(4);
  });

  it('converts the id to a number when updating a theater', () => {
    const updateDto = {};
    service.update.mockReturnValue('updated');

    expect(controller.update('4', updateDto)).toBe('updated');
    expect(service.update).toHaveBeenCalledWith(4, updateDto);
  });

  it('converts the id to a number when removing a theater', () => {
    service.remove.mockReturnValue('removed');

    expect(controller.remove('4')).toBe('removed');
    expect(service.remove).toHaveBeenCalledWith(4);
  });
});
