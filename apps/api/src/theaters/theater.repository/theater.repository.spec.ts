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
            IS_ACTIVE: 1,
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
          isActive: true,
        },
      ]);
      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Theaters t'),
      );
    });

      it('maps inactive theaters to isActive false', async () => {
        databaseService.query.mockResolvedValue({
          rows: [
            {
              THEATER_ID: 2,
              BRANCH_ID: 3,
              NUMBER_SEATS: 80,
              DIMENSION_X: 8,
              DIMENSION_Y: 10,
              PROJECTOR_NAME: 'Dolby',
              IS_ACTIVE: 0,
            },
          ],
        });

        await expect(repository.getAllTheaters()).resolves.toEqual([
          expect.objectContaining({ theaterId: 2, isActive: false }),
        ]);
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
      isActive: true,
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
          isActive: 1,
        }),
      );
    });

      it('defaults isActive to true when it is omitted', async () => {
        const dtoWithoutActive = { ...theaterDto };
        delete dtoWithoutActive.isActive;

        connection.execute
          .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
          .mockResolvedValueOnce({ outBinds: { theaterId: [8] } });

        await expect(repository.createTheater(dtoWithoutActive)).resolves.toEqual({
          theaterId: 8,
          ...dtoWithoutActive,
          isActive: true,
        });
        expect(connection.execute).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('INSERT INTO Theaters'),
          expect.objectContaining({ isActive: 1 }),
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

  describe('getTheaterById', () => {
    it('returns a theater mapped from a database row', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            BRANCH_ID: 2,
            NUMBER_SEATS: 120,
            DIMENSION_X: 10,
            DIMENSION_Y: 12,
            PROJECTOR_NAME: 'IMAX',
            IS_ACTIVE: 1,
          },
        ],
      });

      await expect(repository.getTheaterById(7)).resolves.toEqual({
        theaterId: 7,
        branchId: 2,
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'IMAX',
        isActive: true,
      });
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE t.theater_id = :id'),
        { id: 7 },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
    });

    it('returns null when the theater does not exist', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(repository.getTheaterById(999)).resolves.toBeNull();
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE t.theater_id = :id'),
        { id: 999 },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
    });

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getTheaterById(7)).rejects.toBe(error);
    });
  });

  describe('updateTheater', () => {
    it('returns the existing theater when no fields are provided', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            BRANCH_ID: 2,
            NUMBER_SEATS: 120,
            DIMENSION_X: 10,
            DIMENSION_Y: 12,
            PROJECTOR_NAME: 'IMAX',
            IS_ACTIVE: 1,
          },
        ],
      });

      await expect(repository.updateTheater(7, {})).resolves.toEqual({
        theaterId: 7,
        branchId: 2,
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'IMAX',
        isActive: true,
      });
      expect(databaseService.transaction).not.toHaveBeenCalled();
      expect(databaseService.query).toHaveBeenCalledTimes(1);
    });

    it('throws when an empty update targets a missing theater', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(repository.updateTheater(999, {})).rejects.toThrow(
        'Theater not found: 999',
      );
      expect(databaseService.transaction).not.toHaveBeenCalled();
    });

    it('updates theater fields and returns the refreshed theater', async () => {
      connection.execute.mockResolvedValue({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            BRANCH_ID: 3,
            NUMBER_SEATS: 150,
            DIMENSION_X: 12,
            DIMENSION_Y: 14,
            PROJECTOR_NAME: 'IMAX',
            IS_ACTIVE: 0,
          },
        ],
      });

      await expect(
        repository.updateTheater(7, {
          branchId: 3,
          numberOfSeats: 150,
          dimensionX: 12,
          dimensionY: 14,
          isActive: false,
        }),
      ).resolves.toEqual({
        theaterId: 7,
        branchId: 3,
        numberOfSeats: 150,
        dimensionX: 12,
        dimensionY: 14,
        projectorName: 'IMAX',
        isActive: false,
      });
      expect(databaseService.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Theaters SET'),
        expect.objectContaining({
          id: 7,
          branchId: 3,
          numberOfSeats: 150,
          dimensionX: 12,
          dimensionY: 14,
          isActive: 0,
        }),
      );
    });

    it('resolves the projector when updating projectorName', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            BRANCH_ID: 2,
            NUMBER_SEATS: 120,
            DIMENSION_X: 10,
            DIMENSION_Y: 12,
            PROJECTOR_NAME: 'Dolby',
            IS_ACTIVE: 1,
          },
        ],
      });

      await expect(
        repository.updateTheater(7, { projectorName: 'Dolby' }),
      ).resolves.toEqual({
        theaterId: 7,
        branchId: 2,
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'Dolby',
        isActive: true,
      });
      expect(connection.execute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT projector_id FROM Projectors'),
        { projectorName: 'Dolby' },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE Theaters SET projector_id = :projectorId'),
        expect.objectContaining({ id: 7, projectorId: 42 }),
      );
    });

    it('throws when the projector does not exist during an update', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.updateTheater(7, { projectorName: 'Unknown' }),
      ).rejects.toThrow('Projector not found: Unknown');
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('throws when the update affects no rows', async () => {
      connection.execute.mockResolvedValue({ rowsAffected: 0 });

      await expect(repository.updateTheater(999, { isActive: true })).rejects.toThrow(
        'Theater not found: 999',
      );
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('propagates transaction errors', async () => {
      const error = new Error('Database transaction failed');
      databaseService.transaction.mockRejectedValue(error);

      await expect(repository.updateTheater(7, { isActive: false })).rejects.toBe(error);
    });

    it('throws when the theater disappears before the refreshed lookup', async () => {
      connection.execute.mockResolvedValue({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(repository.updateTheater(7, { isActive: false })).rejects.toThrow(
        'Theater not found: 7',
      );
    });
  });

  describe('deleteTheater', () => {
    it('deactivates an existing theater', async () => {
      databaseService.query.mockResolvedValue({ rowsAffected: 1 });

      await expect(repository.deleteTheater(7)).resolves.toBeUndefined();
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Theaters SET is_active = 0'),
        { id: 7 },
      );
    });

    it('throws when the theater to deactivate does not exist', async () => {
      databaseService.query.mockResolvedValue({ rowsAffected: 0 });

      await expect(repository.deleteTheater(999)).rejects.toThrow(
        'Theater not found: 999',
      );
    });

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.deleteTheater(7)).rejects.toBe(error);
    });
  });
});
