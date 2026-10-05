import { Test, TestingModule } from '@nestjs/testing';
import { TheatersService } from './theaters.service';
import { TheaterRepository } from './theater.repository/theater.repository';

describe('TheatersService', () => {
  let service: TheatersService;
  let repository: {
    createTheater: jest.Mock;
    getAllTheaters: jest.Mock;
    getTheaterById: jest.Mock;
    updateTheater: jest.Mock;
    deleteTheater: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      createTheater: jest.fn(),
      getAllTheaters: jest.fn(),
      getTheaterById: jest.fn(),
      updateTheater: jest.fn(),
      deleteTheater: jest.fn(),
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

  it('returns a theater from the repository', async () => {
    const theater = { theaterId: 4, projectorName: 'IMAX' };
    repository.getTheaterById.mockResolvedValue(theater);

    await expect(service.findOne(4)).resolves.toEqual(theater);
    expect(repository.getTheaterById).toHaveBeenCalledWith(4);
  });

  it('updates a theater through the repository', async () => {
    const updateDto = { numberOfSeats: 150 };
    const theater = { theaterId: 4, numberOfSeats: 150 };
    repository.updateTheater.mockResolvedValue(theater);

    await expect(service.update(4, updateDto)).resolves.toEqual(theater);
    expect(repository.updateTheater).toHaveBeenCalledWith(4, updateDto);
  });

  it('deletes a theater through the repository', async () => {
    repository.deleteTheater.mockResolvedValue(undefined);

    await expect(service.remove(4)).resolves.toBeUndefined();
    expect(repository.deleteTheater).toHaveBeenCalledWith(4);
  });
});
