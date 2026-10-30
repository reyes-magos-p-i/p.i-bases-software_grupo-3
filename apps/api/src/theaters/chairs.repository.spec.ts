import { BadRequestException, NotFoundException, } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ChairsRepository } from './chairs.repository';
import { UpdateSeatsDto } from './dto/update-seats.dto';

describe('ChairsRepository', () => {
  let repository: ChairsRepository;
  let executeMany: jest.Mock;
  let transaction: jest.Mock;
  let execute: jest.Mock;
  let query: jest.Mock;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue({ rowsAffected: 6 });
    executeMany = jest.fn().mockResolvedValue({ rowsAffected: 6 });
    query = jest.fn();
    transaction = jest.fn(async (callback) =>
      callback({ execute, executeMany }),
    );

    repository = new ChairsRepository(
      {query, transaction } as unknown as DatabaseService,
    );
  });

  it('creates every position in a rectangular 2 by 3 theater', async () => {
    await expect(repository.createForTheater(7, 2, 3)).resolves.toEqual({
      theaterId: 7, rows: 2, columns: 3, chairsCreated: 6,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeMany).toHaveBeenCalledTimes(1);
    const [sql, binds, options] = executeMany.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'INSERT INTO SEATS (THEATER_ID, ROW_NUMBER, COLUMN_NUMBER) ' +
      'VALUES (:theaterId, :rowNumber, :columnNumber)',
    );
    expect(binds).toEqual([
      { theaterId: 7, rowNumber: 1, columnNumber: 1 },
      { theaterId: 7, rowNumber: 1, columnNumber: 2 },
      { theaterId: 7, rowNumber: 1, columnNumber: 3 },
      { theaterId: 7, rowNumber: 2, columnNumber: 1 },
      { theaterId: 7, rowNumber: 2, columnNumber: 2 },
      { theaterId: 7, rowNumber: 2, columnNumber: 3 },
    ]);
    expect(options).toEqual({
      autoCommit: false, batchErrors: false,
      bindDefs: {
        theaterId: { type: oracledb.NUMBER },
        rowNumber: { type: oracledb.NUMBER },
        columnNumber: { type: oracledb.NUMBER },
      },
    });
  });

  it('creates one chair at position (1, 1)', async () => {
    await repository.createForTheater(9, 1, 1);
    expect(executeMany.mock.calls[0][1]).toEqual([
      { theaterId: 9, rowNumber: 1, columnNumber: 1 },
    ]);
  });

  it.each([
    [0, 2, 3], [-1, 2, 3], [1.5, 2, 3],
    [7, 0, 3], [7, -2, 3], [7, 2.5, 3],
    [7, 2, 0], [7, 2, -3], [7, 2, 1.5],
    [NaN, 2, 3], [7, Infinity, 3], [7, 2, NaN],
    [Number.MAX_SAFE_INTEGER + 1, 2, 3],
    [7, 101, 100], [7, Number.MAX_SAFE_INTEGER, 2],
  ])('rejects invalid arguments (%s, %s, %s) before accessing the database',
    async (theaterId, x, y) => {
      await expect(repository.createForTheater(theaterId, x, y))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
      expect(executeMany).not.toHaveBeenCalled();
    },
  );

  it('accepts the configured maximum number of chairs', async () => {
    await expect(repository.createForTheater(7, 100, 100))
      .resolves.toMatchObject({ chairsCreated: 10_000 });
    expect(executeMany.mock.calls[0][1]).toHaveLength(10_000);
  });

  it.each(['ORA-00001: duplicate key',
    'ORA-02291: parent key not found',
  ])('propagates database failure: %s', async (message) => {
      const error = new Error(message);
      executeMany.mockRejectedValueOnce(error);
      await expect(repository.createForTheater(7, 2, 3)).rejects.toBe(error);
    });

  it('propagates transaction failures', async () => {
    const error = new Error('Could not acquire connection');
    transaction.mockRejectedValueOnce(error);
    await expect(repository.createForTheater(7, 2, 3)).rejects.toBe(error);
    expect(executeMany).not.toHaveBeenCalled();
  });

  it('deletes the seats using its own transaction', async () => {
    await expect(
      repository.deleteForTheater(7),
    ).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      'DELETE FROM SEATS WHERE THEATER_ID = :theaterId',
      { theaterId: 7 },
      { autoCommit: false },
    );
  });

  it('uses the supplied connection without opening another transaction', async () => {
    const suppliedExecute = jest.fn().mockResolvedValue({
      rowsAffected: 6,
    });

    const conn = {
      execute: suppliedExecute,
    } as unknown as oracledb.Connection;

    await expect(
      repository.deleteForTheater(7, conn),
    ).resolves.toBeUndefined();

    expect(transaction).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();

    expect(suppliedExecute).toHaveBeenCalledWith(
      'DELETE FROM SEATS WHERE THEATER_ID = :theaterId',
      { theaterId: 7 },
      { autoCommit: false },
    );
  });

  it('succeeds when the theater has no seats', async () => {
    execute.mockResolvedValueOnce({ rowsAffected: 0 });

    await expect(
      repository.deleteForTheater(7),
    ).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects invalid theater ID %s',
    async (theaterId) => {
      await expect(
        repository.deleteForTheater(theaterId),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('propagates seat deletion errors', async () => {
    const error = new Error('Seat deletion failed');
    execute.mockRejectedValueOnce(error);

    await expect(repository.deleteForTheater(7)).rejects.toBe(error);
  });

  describe('findByTheater', () => {
  it('returns the theater seats mapped for the selector', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            THEATER_ID: 7,
            ROW_NUMBER: 1,
            COLUMN_NUMBER: 2,
            SEAT_TYPE: 'vip',
            SEAT_STATE: 'free',
          },
        ],
      });

      await expect(repository.findByTheater(7)).resolves.toEqual([
        {
          theaterId: 7,
          rowNumber: 1,
          columnNumber: 2,
          type: 'vip',
          state: 'free',
        },
      ]);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE THEATER_ID = :theaterId'),
        { theaterId: 7 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
    });

    it.each([undefined, []])(
      'returns an empty array when rows are %p',
      async (rows) => {
        query.mockResolvedValueOnce({ rows });

        await expect(repository.findByTheater(7)).resolves.toEqual([]);
      },
    );

    it.each([0, -1, 1.5, NaN, Infinity])(
      'rejects invalid theater ID %s',
      async (id) => {
        await expect(repository.findByTheater(id))
          .rejects.toBeInstanceOf(BadRequestException);

        expect(query).not.toHaveBeenCalled();
      },
    );

    it('propagates database errors', async () => {
      const error = new Error('Database query failed');
      query.mockRejectedValueOnce(error);

      await expect(repository.findByTheater(7)).rejects.toBe(error);
    });
  });

  describe('ChairsRepository.updateSelected', () => {
    let repository: ChairsRepository;
    let executeMany: jest.Mock;
    let transaction: jest.Mock;

    const seats = [
      { rowNumber: 1, columnNumber: 2 },
      { rowNumber: 2, columnNumber: 3 },
    ];

    beforeEach(() => {
      executeMany = jest.fn().mockResolvedValue({
        dmlRowCounts: [1, 1],
      });

      transaction = jest.fn(async work =>
        work({ executeMany }),
      );

      repository = new ChairsRepository(
        { transaction } as unknown as DatabaseService,
      );
    });

    const changes: Omit<UpdateSeatsDto, 'seats'>[] = [
      { state: 'unavailable' },
      { type: 'vip' },
      { state: 'free', type: 'accessibility' },
    ];

    it.each(changes)('updates selected seats with %o', async change => {
      const result = await repository.updateSelected(7, {
        seats,
        ...change,
      });

      expect(result).toEqual({
        theaterId: 7,
        seatsUpdated: 2,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeMany).toHaveBeenCalledTimes(1);

      const [sql, binds, options] = executeMany.mock.calls[0];

      expect(sql).toContain('STATUS = COALESCE(:state, STATUS)');
      expect(sql).toContain('TYPE = COALESCE(:type, TYPE)');
      expect(sql).toContain('THEATER_ID = :theaterId');
      expect(sql).toContain('ROW_NUMBER = :rowNumber');
      expect(sql).toContain('COLUMN_NUMBER = :columnNumber');

      expect(binds).toEqual(
        seats.map(seat => ({
          theaterId: 7,
          ...seat,
          state: change.state ?? null,
          type: change.type ?? null,
        })),
      );

      expect(options).toMatchObject({
        autoCommit: false,
        batchErrors: false,
        dmlRowCounts: true,
      });
    });

    it('updates duplicate positions only once', async () => {
      executeMany.mockResolvedValueOnce({
        dmlRowCounts: [1],
      });

      const result = await repository.updateSelected(7, {
        seats: [seats[0]!, seats[0]!],
        type: 'vip',
      });

      expect(result.seatsUpdated).toBe(1);
      expect(executeMany.mock.calls[0][1]).toHaveLength(1);
    });

    it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid theater ID %s',
      async theaterId => {
        await expect(
          repository.updateSelected(theaterId, {
            seats,
            type: 'vip',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects the transaction when a selected seat is missing', async () => {
      executeMany.mockResolvedValueOnce({
        dmlRowCounts: [1, 0],
      });

      await expect(
        repository.updateSelected(7, {
          seats,
          state: 'unavailable',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates database errors', async () => {
      const error = new Error('Oracle update failed');
      executeMany.mockRejectedValueOnce(error);

      await expect(
        repository.updateSelected(7, {
          seats,
          type: 'vip',
        }),
      ).rejects.toBe(error);
    });
  });

});
