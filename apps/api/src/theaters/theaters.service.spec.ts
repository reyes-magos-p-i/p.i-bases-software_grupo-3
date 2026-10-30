import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TheatersService } from './theaters.service';
import { TheaterRepository } from './theater.repository/theater.repository';
import { ChairsRepository } from './chairs.repository';
import { UpdateSeatsDto } from './dto/update-seats.dto';


describe('TheatersService', () => {
  let service: TheatersService;
  let repository: {
    createTheater: jest.Mock;
    getAllTheaters: jest.Mock;
    getTheaterById: jest.Mock;
    updateTheater: jest.Mock;
    deleteTheater: jest.Mock;
  };
  let chairsRepository: {
    findByTheater: jest.Mock;
    updateSelected: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      createTheater: jest.fn(),
      getAllTheaters: jest.fn(),
      getTheaterById: jest.fn(),
      updateTheater: jest.fn(),
      deleteTheater: jest.fn(),
    };
    chairsRepository = {
      findByTheater: jest.fn(),
      updateSelected: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheatersService,
        { provide: TheaterRepository, useValue: repository },
        { provide: ChairsRepository, useValue: chairsRepository },
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
      cinema: 'Cinema Test',
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

  it('rejects a theater whose seat count does not match its dimensions', async () => {
    const theaterDto = {
      cinema: 'Cinema Test',
      numberOfSeats: 121,
      dimensionX: 10,
      dimensionY: 12,
      projectorName: 'IMAX',
    };

    await expect(service.create(theaterDto)).rejects.toThrow('Invalid theater seat dimensions');
    expect(repository.createTheater).not.toHaveBeenCalled();
  });

  it('rejects non-positive or out-of-range seat dimensions on creation', async () => {
    const invalidTheaters = [
      { numberOfSeats: 0, dimensionX: 0, dimensionY: 5 },
      { numberOfSeats: 5001, dimensionX: 1, dimensionY: 5001 },
      { numberOfSeats: -4, dimensionX: -2, dimensionY: 2 },
      { numberOfSeats: 6, dimensionX: 2.5, dimensionY: 2.4 },
    ];

    for (const dimensions of invalidTheaters) {
      await expect(
        service.create({
          cinema: 'Cinema Test',
          ...dimensions,
          projectorName: 'IMAX',
        }),
      ).rejects.toThrow('Invalid theater seat dimensions');
    }

    expect(repository.createTheater).not.toHaveBeenCalled();
  });

  it('accepts exactly 5000 seats', async () => {
    const theaterDto = {
      cinema: 'Cinema Test',
      numberOfSeats: 5000,
      dimensionX: 100,
      dimensionY: 50,
      projectorName: 'IMAX',
    };
    repository.createTheater.mockResolvedValue({ theaterId: 8, ...theaterDto });

    await expect(service.create(theaterDto)).resolves.toMatchObject({ theaterId: 8 });
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
    const updateDto = { numberOfSeats: 120 };
    const theater = { theaterId: 4, numberOfSeats: 120 };
    repository.getTheaterById.mockResolvedValue({
      theaterId: 4,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
    });
    repository.updateTheater.mockResolvedValue(theater);

    await expect(service.update(4, updateDto)).resolves.toEqual(theater);
    expect(repository.updateTheater).toHaveBeenCalledWith(4, updateDto);
  });

  it('rejects an update that would make the seat count inconsistent', async () => {
    repository.getTheaterById.mockResolvedValue({
      theaterId: 4,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
    });

    await expect(service.update(4, { dimensionX: 11 })).rejects.toThrow(
      'Invalid theater seat dimensions',
    );
    expect(repository.updateTheater).not.toHaveBeenCalled();
  });

  it('rejects invalid seat dimensions on update', async () => {
    repository.getTheaterById.mockResolvedValue({
      theaterId: 4,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
    });

    await expect(service.update(4, { numberOfSeats: 0 })).rejects.toThrow(
      'Invalid theater seat dimensions',
    );
    expect(repository.updateTheater).not.toHaveBeenCalled();
  });

  it('deletes a theater through the repository', async () => {
    repository.deleteTheater.mockResolvedValue(undefined);

    await expect(service.remove(4)).resolves.toBeUndefined();
    expect(repository.deleteTheater).toHaveBeenCalledWith(4);
  });

  const validCases = [
    [1, 1, 1],
    [1, 5000, 5000],
    [5000, 1, 5000],
    [25, 200, 5000],
    [10, 10, 100],
  ];
  const invalidCases = [
    [2, 3, 5],
    [0, 5, 0],
    [-1, 5, 5],
    [5, 0, 0],
    [5, -1, 5],
    [1, 1, 0],
    [1, 1, -1],
    [1, 5001, 5001],
    [2, 2500, 5001],
    [0, 0, 5001],
  ];

  it.each(validCases)('service accepts %i x %i = %i', async (x, y, seats) => {
    const dto = { cinema: 'Cinema Test', dimensionX: x, dimensionY: y, numberOfSeats: seats, projectorName: 'IMAX' };
    repository.createTheater.mockResolvedValue({ theaterId: 1, ...dto });
    await expect(service.create(dto)).resolves.toMatchObject({ theaterId: 1 });
  });

  it.each(invalidCases)('service rejects %i x %i, seats %i', async (x, y, seats) => {
    await expect(
      service.create({ cinema: 'Cinema Test', dimensionX: x, dimensionY: y, numberOfSeats: seats, projectorName: 'IMAX' }),
    ).rejects.toThrow('Invalid theater seat dimensions');
  });

  describe('getSeats', () => {
    const seats = [
      {
        theaterId: 7,
        rowNumber: 1,
        columnNumber: 2,
        type: 'vip',
        state: 'free',
      },
    ];

    it('returns the seats for an existing theater', async () => {
      repository.getTheaterById.mockResolvedValueOnce({
        theaterId: 7,
      });
      chairsRepository.findByTheater.mockResolvedValueOnce(seats);

      await expect(service.getSeats(7)).resolves.toEqual(seats);

      expect(repository.getTheaterById).toHaveBeenCalledWith(7);
      expect(chairsRepository.findByTheater).toHaveBeenCalledWith(7);
    });

    it('throws when the theater does not exist', async () => {
      repository.getTheaterById.mockResolvedValueOnce(null);

      await expect(service.getSeats(999))
        .rejects.toBeInstanceOf(NotFoundException);

      expect(chairsRepository.findByTheater).not.toHaveBeenCalled();
    });

    it('returns an empty array when the theater has no seats', async () => {
      repository.getTheaterById.mockResolvedValueOnce({
        theaterId: 7,
      });
      chairsRepository.findByTheater.mockResolvedValueOnce([]);

      await expect(service.getSeats(7)).resolves.toEqual([]);
    });

    it('propagates seat retrieval errors', async () => {
      const error = new Error('Seat retrieval failed');

      repository.getTheaterById.mockResolvedValueOnce({
        theaterId: 7,
      });
      chairsRepository.findByTheater.mockRejectedValueOnce(error);

      await expect(service.getSeats(7)).rejects.toBe(error);
    });
  });

  describe('updateSelected', () => {
    const dto: UpdateSeatsDto = {
      seats: [{ rowNumber: 1, columnNumber: 2 }],
      type: 'vip',
    };

    it('passes the request to the repository and returns its result', async () => {
      const result = {
        theaterId: 7,
        seatsUpdated: 1,
      };

      chairsRepository.updateSelected.mockResolvedValueOnce(result);

      await expect(
        service.updateSelected(7, dto),
      ).resolves.toEqual(result);

      expect(chairsRepository.updateSelected).toHaveBeenCalledWith(7, dto);
    });

    it('propagates repository errors', async () => {
      const error = new NotFoundException('Seat not found');
      chairsRepository.updateSelected.mockRejectedValueOnce(error);

      await expect(
        service.updateSelected(7, dto),
      ).rejects.toBe(error);
    });
  });
});
