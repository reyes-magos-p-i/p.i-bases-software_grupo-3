import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TheaterRepository } from './theater.repository';
import { ChairsRepository } from '../chairs.repository';

describe('TheaterRepository', () => {
  let repository: TheaterRepository;
  let databaseService: { query: jest.Mock; transaction: jest.Mock };
  let connection: { execute: jest.Mock };
  let chairsRepository: {
    createForTheater: jest.Mock;
    deleteForTheater: jest.Mock;
    synchronizeLayout: jest.Mock;
  };

  beforeEach(async () => {
    connection = {
      execute: jest.fn(),
    };
    databaseService = {
      query: jest.fn(),
      transaction: jest.fn(
        (work: (conn: typeof connection) => Promise<unknown>) =>
          work(connection),
      ),
    };
    chairsRepository = {
      createForTheater: jest.fn().mockResolvedValue(undefined),
      deleteForTheater: jest.fn().mockResolvedValue(undefined),
      synchronizeLayout: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheaterRepository,
        { provide: DatabaseService, useValue: databaseService },
        { provide: ChairsRepository, useValue: chairsRepository },
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
            CINEMA: 'Cinema 2',
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
          cinema: 'Cinema 2',
          numberOfSeats: 120,
          dimensionX: 10,
          dimensionY: 12,
          projectorName: 'IMAX',
          isActive: true,
          canResize: false,
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
            CINEMA: 'Cinema 3',
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
      cinema: 'Cinema 2',
      numberOfSeats: 120,
      dimensionX: 10,
      dimensionY: 12,
      projectorName: 'IMAX',
      isActive: true,
      status: 'Disponible' as const,
    };

    it('resolves the projector and returns the created theater', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rows: [{ BRANCH_ID: 2 }] })
        .mockResolvedValueOnce({ rows: [{ THEATER_STATUS_ID: 1 }] })
        .mockResolvedValueOnce({ outBinds: { theaterId: [7] } });

      await expect(repository.createTheater(theaterDto)).resolves.toEqual({
        theaterId: 7,
        ...theaterDto,
        canResize: true,
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
        expect.stringContaining('SELECT branch_id FROM Cinemas'),
        { cinema: theaterDto.cinema },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          'SELECT theater_status_id FROM TheaterStatuses',
        ),
        { name: 'Disponible' },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO Theaters'),
        expect.objectContaining({
          theaterStatusId: 1,
          branchId: 2,
          numberOfSeats: theaterDto.numberOfSeats,
          dimensionX: theaterDto.dimensionX,
          dimensionY: theaterDto.dimensionY,
          projectorId: 42,
          isActive: 1,
        }),
      );
      expect(chairsRepository.createForTheater).toHaveBeenCalledTimes(1);
      expect(chairsRepository.createForTheater).toHaveBeenCalledWith(
        7,
        theaterDto.dimensionX,
        theaterDto.dimensionY,
        connection,
      );
    });

    it('defaults isActive to true when it is omitted', async () => {
      const { isActive: ignoredIsActive, ...dtoWithoutActive } = theaterDto;
      expect(ignoredIsActive).toBe(true);

      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rows: [{ BRANCH_ID: 2 }] })
        .mockResolvedValueOnce({ rows: [{ THEATER_STATUS_ID: 1 }] })
        .mockResolvedValueOnce({ outBinds: { theaterId: [8] } });

      await expect(repository.createTheater(dtoWithoutActive)).resolves.toEqual(
        {
          theaterId: 8,
          ...dtoWithoutActive,
          canResize: true,
          isActive: true,
          status: 'Disponible',
        },
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO Theaters'),
        expect.objectContaining({ isActive: 1 }),
      );
    });

    it('rejects when the projector does not exist', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });

      await expect(repository.createTheater(theaterDto)).rejects.toThrow(
        'Selecciona un proyector válido.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });

    it('rejects when the cinema does not exist', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(repository.createTheater(theaterDto)).rejects.toThrow(
        'Selecciona una sucursal válida.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });

    it('rejects when the status does not exist', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rows: [{ BRANCH_ID: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.createTheater({ ...theaterDto, status: 'Roto' }),
      ).rejects.toThrow('Selecciona un estado de sala válido.');
      expect(connection.execute).toHaveBeenCalledTimes(3);
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
            CINEMA: 'Cinema 2',
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
        cinema: 'Cinema 2',
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'IMAX',
        isActive: true,
        canResize: false,
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
    function prepareLayout(functions: number) {
      connection.execute.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('FOR UPDATE')
            ? { rows: [{ DIMENSION_X: 2, DIMENSION_Y: 3, NUMBER_SEATS: 6 }] }
            : sql.includes('COUNT(*)')
              ? { rows: [{ TOTAL: functions }] }
              : { rowsAffected: 1 },
        ),
      );
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            DIMENSION_X: 3,
            DIMENSION_Y: 4,
            NUMBER_SEATS: 12,
            CAN_RESIZE: functions ? 0 : 1,
          },
        ],
      });
    }

    it('synchronizes seats under the theater lock before committing new dimensions', async () => {
      prepareLayout(0);
      const result = await repository.updateTheater(7, {
        dimensionX: 3,
        dimensionY: 4,
        numberOfSeats: 12,
      });
      expect(result.canResize).toBe(true);
      expect(connection.execute.mock.calls[0][0]).toContain(
        'FOR UPDATE WAIT 5',
      );
      expect(chairsRepository.synchronizeLayout).toHaveBeenCalledWith(
        7,
        3,
        4,
        connection,
      );
      expect(
        chairsRepository.synchronizeLayout.mock.invocationCallOrder[0],
      ).toBeLessThan(connection.execute.mock.invocationCallOrder[2]);
    });

    it('rejects changes to seat coordinates even if the total capacity is unchanged', async () => {
      prepareLayout(1);
      await expect(
        repository.updateTheater(7, { dimensionX: 3, dimensionY: 2 }),
      ).rejects.toThrow('No puedes cambiar las dimensiones');
      expect(chairsRepository.synchronizeLayout).not.toHaveBeenCalled();
      expect(connection.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Theaters'),
        expect.anything(),
      );
    });

    it('allows ordinary edits with unchanged dimensions in a theater with historical functions', async () => {
      prepareLayout(4);
      await expect(
        repository.updateTheater(7, {
          dimensionX: 2,
          dimensionY: 3,
          numberOfSeats: 6,
          isActive: true,
        }),
      ).resolves.toMatchObject({ canResize: false });
      expect(chairsRepository.synchronizeLayout).not.toHaveBeenCalled();
      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Theaters'),
        expect.objectContaining({ isActive: 1 }),
      );
    });

    it('repairs missing positions when saving an unreferenced theater without changing its dimensions', async () => {
      prepareLayout(0);
      await repository.updateTheater(7, { numberOfSeats: 6 });
      expect(chairsRepository.synchronizeLayout).toHaveBeenCalledWith(
        7,
        2,
        3,
        connection,
      );
    });

    it('revalidates capacity against the locked values', async () => {
      prepareLayout(0);
      await expect(
        repository.updateTheater(7, { dimensionX: 4 }),
      ).rejects.toThrow('El número de asientos');
      expect(chairsRepository.synchronizeLayout).not.toHaveBeenCalled();
    });

    it('does not update the theater when synchronizing its seats fails', async () => {
      prepareLayout(0);
      const failure = new Error('Failed to synchronize seats');
      chairsRepository.synchronizeLayout.mockRejectedValueOnce(failure);
      await expect(
        repository.updateTheater(7, {
          dimensionX: 3,
          dimensionY: 4,
          numberOfSeats: 12,
        }),
      ).rejects.toBe(failure);
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });

    it('reports a missing theater before altering any seats', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });
      await expect(
        repository.updateTheater(7, { dimensionX: 1 }),
      ).rejects.toThrow('La sala seleccionada ya no existe.');
      expect(chairsRepository.synchronizeLayout).not.toHaveBeenCalled();
    });
    it('returns the existing theater when no fields are provided', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            CINEMA: 'Cinema 2',
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
        cinema: 'Cinema 2',
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'IMAX',
        isActive: true,
        canResize: false,
      });
      expect(databaseService.transaction).not.toHaveBeenCalled();
      expect(databaseService.query).toHaveBeenCalledTimes(1);
    });

    it('throws when an empty update targets a missing theater', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(repository.updateTheater(999, {})).rejects.toThrow(
        'La sala seleccionada ya no existe.',
      );
      expect(databaseService.transaction).not.toHaveBeenCalled();
    });

    it('updates theater fields and returns the refreshed theater', async () => {
      connection.execute
        .mockResolvedValueOnce({
          rows: [{ DIMENSION_X: 10, DIMENSION_Y: 12, NUMBER_SEATS: 120 }],
        })
        .mockResolvedValueOnce({ rows: [{ TOTAL: 0 }] })
        .mockResolvedValueOnce({ rows: [{ BRANCH_ID: 3 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            CINEMA: 'Cinema 3',
            NUMBER_SEATS: 168,
            DIMENSION_X: 12,
            DIMENSION_Y: 14,
            PROJECTOR_NAME: 'IMAX',
            IS_ACTIVE: 0,
          },
        ],
      });

      await expect(
        repository.updateTheater(7, {
          cinema: 'Cinema 3',
          numberOfSeats: 168,
          dimensionX: 12,
          dimensionY: 14,
          isActive: false,
        }),
      ).resolves.toEqual({
        theaterId: 7,
        cinema: 'Cinema 3',
        numberOfSeats: 168,
        dimensionX: 12,
        dimensionY: 14,
        projectorName: 'IMAX',
        isActive: false,
        canResize: false,
      });
      expect(databaseService.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE Theaters SET'),
        expect.objectContaining({
          id: 7,
          branchId: 3,
          numberOfSeats: 168,
          dimensionX: 12,
          dimensionY: 14,
          isActive: 0,
        }),
      );
    });

    it('resolves the status id when updating status', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ THEATER_STATUS_ID: 2 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({ rows: [] });

      await repository
        .updateTheater(7, { status: 'En función' })
        .catch(() => undefined);

      expect(connection.execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          'UPDATE Theaters SET theater_status_id = :theaterStatusId',
        ),
        expect.objectContaining({ id: 7, theaterStatusId: 2 }),
      );
    });

    it('rejects an update with an unknown status', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.updateTheater(7, { status: 'Roto' }),
      ).rejects.toThrow('Selecciona un estado de sala válido.');
    });

    it('resolves the projector when updating projectorName', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ PROJECTOR_ID: 42 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({
        rows: [
          {
            THEATER_ID: 7,
            CINEMA: 'Cinema 2',
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
        cinema: 'Cinema 2',
        numberOfSeats: 120,
        dimensionX: 10,
        dimensionY: 12,
        projectorName: 'Dolby',
        isActive: true,
        canResize: false,
      });
      expect(connection.execute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT projector_id FROM Projectors'),
        { projectorName: 'Dolby' },
        expect.objectContaining({ outFormat: expect.anything() }),
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          'UPDATE Theaters SET projector_id = :projectorId',
        ),
        expect.objectContaining({ id: 7, projectorId: 42 }),
      );
    });

    it('throws when the projector does not exist during an update', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.updateTheater(7, { projectorName: 'Unknown' }),
      ).rejects.toThrow('Selecciona un proyector válido.');
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('throws when the update affects no rows', async () => {
      connection.execute.mockResolvedValue({ rowsAffected: 0 });

      await expect(
        repository.updateTheater(999, { isActive: true }),
      ).rejects.toThrow('La sala seleccionada ya no existe.');
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('propagates transaction errors', async () => {
      const error = new Error('Database transaction failed');
      databaseService.transaction.mockRejectedValue(error);

      await expect(
        repository.updateTheater(7, { isActive: false }),
      ).rejects.toBe(error);
    });

    it('throws when the theater disappears before the refreshed lookup', async () => {
      connection.execute.mockResolvedValue({ rowsAffected: 1 });
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(
        repository.updateTheater(7, { isActive: false }),
      ).rejects.toThrow('La sala seleccionada ya no existe.');
    });
  });

  describe('deleteTheater', () => {
    it('deactivates the theater while preserving seats and ticket history', async () => {
      connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });

      await expect(repository.deleteTheater(7)).resolves.toBeUndefined();

      expect(databaseService.transaction).toHaveBeenCalledTimes(1);

      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE Theaters SET is_active = 0 WHERE theater_id = :id',
        ),
        { id: 7 },
        { autoCommit: false },
      );

      expect(chairsRepository.deleteForTheater).not.toHaveBeenCalled();
    });

    it('throws when the theater does not exist', async () => {
      connection.execute.mockResolvedValueOnce({ rowsAffected: 0 });

      await expect(repository.deleteTheater(999)).rejects.toThrow(
        'La sala seleccionada ya no existe.',
      );

      expect(chairsRepository.deleteForTheater).not.toHaveBeenCalled();
    });

    it('propagates transaction errors', async () => {
      const error = new Error('Database transaction failed');

      databaseService.transaction.mockRejectedValueOnce(error);

      await expect(repository.deleteTheater(7)).rejects.toBe(error);

      expect(chairsRepository.deleteForTheater).not.toHaveBeenCalled();
    });
  });
});
