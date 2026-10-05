import { Test, TestingModule } from '@nestjs/testing';
import { TheatersService } from './theaters.service';
import { TheaterRepository } from './theater.repository/theater.repository';

describe('TheatersService', () => {
  let service: TheatersService;
  let repository: {
    createTheater: jest.Mock;
    getAllTheaters: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      createTheater: jest.fn(),
      getAllTheaters: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheatersService,
        { provide: TheaterRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<TheatersService>(TheatersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a theater through the repository', async () => {
    const theaterDto = {
      branchId: 2,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
      projectorName: 'IMAX',
    };
    const createdTheater = { theaterId: 7, ...theaterDto };
    repository.createTheater.mockResolvedValue(createdTheater);

    await expect(service.create(theaterDto)).resolves.toEqual(createdTheater);
    expect(repository.createTheater).toHaveBeenCalledWith(theaterDto);
  });

  it('returns all theaters from the repository', async () => {
    const theaters = [{ theaterId: 1, projectorName: 'IMAX' }];
    repository.getAllTheaters.mockResolvedValue(theaters);

    await expect(service.findAll()).resolves.toEqual(theaters);
    expect(repository.getAllTheaters).toHaveBeenCalledTimes(1);
  });

  it('returns a theater message for findOne', () => {
    expect(service.findOne(4)).toBe('This action returns a #4 theater');
  });

  it('returns a theater message for update', () => {
    expect(service.update(4, {})).toBe('This action updates a #4 theater');
  });

  it('returns a theater message for remove', () => {
    expect(service.remove(4)).toBe('This action removes a #4 theater');
  });
});
