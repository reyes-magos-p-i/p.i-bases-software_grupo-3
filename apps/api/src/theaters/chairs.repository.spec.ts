import { BadRequestException } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ChairsRepository } from './chairs.repository';

describe('ChairsRepository', () => {
  let repository: ChairsRepository;
  let executeMany: jest.Mock;
  let transaction: jest.Mock;

  beforeEach(() => {
    executeMany = jest.fn().mockResolvedValue({ rowsAffected: 6 });
    transaction = jest.fn(async (callback) => callback({ executeMany }));
    repository = new ChairsRepository(
      { transaction } as unknown as DatabaseService,
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
});
