import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TheaterRepository } from './theater.repository';

describe('TheaterRepository', () => {
  let repository: TheaterRepository;
  let databaseService: { query: jest.Mock; transaction: jest.Mock };
  let connection: { execute: jest.Mock };

  beforeEach(async () => {
    connection = {
      execute: jest.fn(),
    };
    databaseService = {
      query: jest.fn(),
      transaction: jest.fn((work: (conn: typeof connection) => Promise<unknown>) =>
        work(connection),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheaterRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    repository = module.get<TheaterRepository>(TheaterRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getAllTheaters', () => {
    it('returns theaters mapped from database rows', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 1,
            BRANCH_ID: 2,
            NUMBER_SEATS: 120,
            DIMENSION_X: 10,
            DIMENSION_Y: 12,
            PROJECTOR_NAME: 'IMAX',
          },
        ],
      });

      await expect(repository.getAllTheaters()).resolves.toEqual([
        {
          theaterId: 1,
          branchId: 2,
          numberOfSeats: 120,
          dimensionX: 10,
          dimensionY: 12,
          projectorName: 'IMAX',
        },
      ]);
      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Theaters t'),
      );
    });

    it.each([undefined, null, []])(
      'returns an empty list when database rows are %p',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });

        await expect(repository.getAllTheaters()).resolves.toEqual([]);
      },
    );

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getAllTheaters()).rejects.toBe(error);
    });
  });

  describe('createTheater', () => {
    const theaterDto = {
      branchId: 2,
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
      projectorName: 'IMAX',
    };

    it('resolves the projector and returns the created theater', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ outBinds: { theaterId: [7] } });

      await expect(repository.createTheater(theaterDto)).resolves.toEqual({
        theaterId: 7,
        ...theaterDto,
      });
      expect(databaseService.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT projector_id FROM Projectors'),
        { projectorName: theaterDto.projectorName },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO Theaters'),
        expect.objectContaining({
          branchId: theaterDto.branchId,
          numberOfSeats: theaterDto.numberOfSeats,
          dimensionX: theaterDto.dimensionX,
          dimensionY: theaterDto.dimensionY,
          projectorId: 42,
        }),
      );
    });

    it('rejects when the projector does not exist', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });

      await expect(repository.createTheater(theaterDto)).rejects.toThrow(
        'Projector not found: IMAX',
      );
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates transaction errors', async () => {
      const error = new Error('Database transaction failed');
      databaseService.transaction.mockRejectedValue(error);

      await expect(repository.createTheater(theaterDto)).rejects.toBe(error);
    });
  });
});
