import * as oracledb from 'oracledb';

import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';

describe('PromotionsRepository', () => {
  let repository: PromotionsRepository;

  let connection: {
    execute: jest.Mock;
    executeMany: jest.Mock;
  };

  let db: {
    transaction: jest.Mock;
  };

  const validDto = (): CreatePromotionDto => ({
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    beginHour: '14:30',
    endHour: '18:00',
    projectionFormat: '2D',
    technology: 'STANDARD',
    promotionTitle: '  Afternoon discount  ',
    description: '  Discount description.  ',
    conditions: 'Subject to availability.',
    posterPath: '/uploads/posters/promotion.webp',
    weekdays: [2, 4],
    branchIds: [1, 2],
  });

  const listItem = {
    promotionId: 42,
    promotionType: 'percentage' as const,
    technology: 'IMAX' as const,
    promotionTitle: 'Afternoon discount',
    projectionFormat: '2D' as const,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
  };
  const detail = {
    ...listItem,
    promotionAmount: 25,
    description: 'Discount description.',
    conditions: null,
    posterPath: '/uploads/promotions/banner.webp',
    beginHour: '14:30',
    endHour: '24:00',
    weekdays: [2, 4],
    branchIds: [1, 2],
  };

  beforeEach(() => {
    connection = {
      execute: jest.fn().mockResolvedValue({
        outBinds: {
          promotionId: [42],
        },
      }),
      executeMany: jest.fn().mockResolvedValue({
        rowsAffected: 2,
      }),
    };

    db = {
      transaction: jest.fn(
        async (
          callback: (
            conn: typeof connection,
          ) => Promise<number>,
        ) => callback(connection),
      ),
    };

    repository = new PromotionsRepository(
      db as unknown as DatabaseService,
    );
  });

  it('inserts the promotion and returns its generated ID', async () => {
    await expect(repository.create(validDto())).resolves.toBe(42);

    expect(db.transaction).toHaveBeenCalledTimes(1);

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO promotions'),
      expect.objectContaining({
        promotionType: 'percentage',
        promotionAmount: 25,
        beginDate: '2026-11-17',
        endDate: '2026-12-31',
        beginSeconds: {
          val: 52200,
          type: oracledb.NUMBER,
        },
        endSeconds: {
          val: 64800,
          type: oracledb.NUMBER,
        },
        projectionFormat: '2D',
        technology: 'STANDARD',
        promotionTitle: 'Afternoon discount',
        description: 'Discount description.',
        conditions: 'Subject to availability.',
        posterPath: '/uploads/posters/promotion.webp',
        promotionId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      }),
      { autoCommit: false },
    );
  });

  it('inserts weekdays using the generated promotion ID', async () => {
    await repository.create(validDto());

    expect(connection.executeMany).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO promotion_weekdays'),
      [
        { promotionId: 42, dayOfWeek: 2 },
        { promotionId: 42, dayOfWeek: 4 },
      ],
      {
        autoCommit: false,
        bindDefs: {
          promotionId: { type: oracledb.NUMBER },
          dayOfWeek: { type: oracledb.NUMBER },
        },
      },
    );
  });

  it.each([undefined, null, []])(
    'skips weekday inserts but still associates cinemas when weekdays is %p',
    async (weekdays) => {
      await repository.create({
        ...validDto(),
        weekdays,
      });

      expect(connection.executeMany).toHaveBeenCalledTimes(1);

      expect(connection.executeMany).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promotion_cinemas'),
        [
          { promotionId: 42, branchId: 1 },
          { promotionId: 42, branchId: 2 },
        ],
        {
          autoCommit: false,
          bindDefs: {
            promotionId: { type: oracledb.NUMBER },
            branchId: { type: oracledb.NUMBER },
          },
        },
      );
    },
  );

  it.each([undefined, null])(
    'binds absent optional values as null: %p',
    async (value) => {
      await repository.create({
        ...validDto(),
        beginHour: value,
        endHour: value,
        projectionFormat: value,
        technology: value,
        conditions: value,
        posterPath: value,
      });

      expect(connection.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          beginSeconds: {
            val: null,
            type: oracledb.NUMBER,
          },
          endSeconds: {
            val: null,
            type: oracledb.NUMBER,
          },
          projectionFormat: null,
          technology: null,
          conditions: null,
          posterPath: null,
        }),
        { autoCommit: false },
      );
    },
  );

  it('converts midnight and the end of the day correctly', async () => {
    await repository.create({
      ...validDto(),
      beginHour: '00:00',
      endHour: '24:00',
    });

    expect(connection.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        beginSeconds: {
          val: 0,
          type: oracledb.NUMBER,
        },
        endSeconds: {
          val: 86400,
          type: oracledb.NUMBER,
        },
      }),
      { autoCommit: false },
    );
  });

  it('stops if inserting the promotion fails', async () => {
    const error = new Error('Promotion insert failed');
    connection.execute.mockRejectedValueOnce(error);

    await expect(repository.create(validDto())).rejects.toBe(error);

    expect(connection.executeMany).not.toHaveBeenCalled();
  });

  it('propagates weekday failures to the transaction handler', async () => {
    const error = new Error('Weekday insert failed');
    connection.executeMany.mockRejectedValueOnce(error);

    await expect(repository.create(validDto())).rejects.toBe(error);
  });

  it('associates the promotion with the selected cinemas', async () => {
    await repository.create({
      ...validDto(),
      branchIds: [1, 2],
    });

    expect(connection.executeMany).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO promotion_cinemas'),
      [
        { promotionId: 42, branchId: 1 },
        { promotionId: 42, branchId: 2 },
      ],
      {
        autoCommit: false,
        bindDefs: {
          promotionId: { type: oracledb.NUMBER },
          branchId: { type: oracledb.NUMBER },
        },
      },
    );
  });

  it('propagates cinema insertion failures to the transaction handler', async () => {
    const error = new Error('Cinema insert failed');

    connection.executeMany.mockRejectedValueOnce(error);

    await expect(
      repository.create({
        ...validDto(),
        weekdays: [],
      }),
    ).rejects.toBe(error);
  });

  it('rejects nonexistent cinemas with a BadRequestException', async () => {
    connection.executeMany.mockRejectedValueOnce(
      Object.assign(new Error(
        'ORA-02291: integrity constraint ' +
        '(PRODUCTION.FK_PROMO_CINEMAS_CINEMA) violated - parent key not found',
      ), {
        errorNum: 2291,
      }),
    );

    await expect(
      repository.create({
        ...validDto(),
        weekdays: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  describe('findAll', () => {
    it('returns basic promotion rows using object aliases and a stable order', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [listItem] });
      await expect(repository.findAll()).resolves.toEqual([listItem]);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(1);
      const [sql, binds, options] = connection.execute.mock.calls[0];
      expect(sql).toContain('p.promotion_id AS "promotionId"');
      expect(sql).toContain('p.promotion_type AS "promotionType"');
      expect(sql).toContain('p.technology AS "technology"');
      expect(sql).toContain('p.promotion_title AS "promotionTitle"');
      expect(sql).toContain('p.projection_format AS "projectionFormat"');
      expect(sql).toContain("TO_CHAR(p.begin_date, 'YYYY-MM-DD')");
      expect(sql).toContain("TO_CHAR(p.end_date, 'YYYY-MM-DD')");
      expect(sql).toContain('ORDER BY p.promotion_id DESC');
      // This is the complete administrative catalog, without a date filter or joins.
      expect(sql).not.toMatch(/\bWHERE\b/i);
      expect(sql).not.toMatch(/\bJOIN\b/i);
      expect(binds).toEqual({});
      expect(options).toEqual({ outFormat: oracledb.OUT_FORMAT_OBJECT });
      expect(connection.executeMany).not.toHaveBeenCalled();
    });

    it.each([{ rows: [] }, {}])('returns an empty list for empty results: %p', async (result) => {
      connection.execute.mockResolvedValueOnce(result);
      await expect(repository.findAll()).resolves.toEqual([]);
    });

    it('propagates query failures', async () => {
      const error = new Error('Read failed');
      connection.execute.mockRejectedValueOnce(error);
      await expect(repository.findAll()).rejects.toBe(error);
    });
  });

  describe('findOne', () => {
    const row = {
      ...listItem, promotionAmount: detail.promotionAmount, description: detail.description,
      conditions: detail.conditions, posterPath: detail.posterPath,
      beginHour: detail.beginHour, endHour: detail.endHour,
    };

    it('reads the promotion and both associations with the same bound ID', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ dayOfWeek: 2 }, { dayOfWeek: 4 }] })
        .mockResolvedValueOnce({ rows: [{ branchId: 1 }, { branchId: 2 }] });
      await expect(repository.findOne(42)).resolves.toEqual(detail);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(3);
      for (const [, binds, options] of connection.execute.mock.calls) {
        expect(binds).toEqual({ id: 42 });
        expect(options).toEqual({ outFormat: oracledb.OUT_FORMAT_OBJECT });
      }
      const sql = connection.execute.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE p.promotion_id = :id');
      expect(sql).toContain('p.promotion_description AS "description"');
      expect(sql).toContain('p.promotion_amount AS "promotionAmount"');
      expect(sql).toContain('EXTRACT(DAY FROM p.end_hour) * 24');
      expect(sql).toContain('CASE WHEN p.begin_hour IS NULL THEN NULL');
      expect(sql).toContain('CASE WHEN p.end_hour IS NULL THEN NULL');
      expect(connection.execute.mock.calls[1][0]).toContain('ORDER BY day_of_week');
      expect(connection.execute.mock.calls[2][0]).toContain('ORDER BY branch_id');
      expect(connection.executeMany).not.toHaveBeenCalled();
    });

    it.each([{ rows: [] }, {}])('returns null without reading associations when absent: %p', async (result) => {
      connection.execute.mockResolvedValueOnce(result);
      await expect(repository.findOne(999)).resolves.toBeNull();
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });

    it('preserves null optional fields and returns empty association arrays', async () => {
      const unrestricted = {
        ...row, beginHour: null, endHour: null, projectionFormat: null,
        technology: null, conditions: null, posterPath: null,
      };
      connection.execute
        .mockResolvedValueOnce({ rows: [unrestricted] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(repository.findOne(42)).resolves.toEqual({
        ...unrestricted, weekdays: [], branchIds: [],
      });
    });

    it('handles undefined association rows as empty arrays', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      await expect(repository.findOne(42)).resolves.toEqual({
        ...row, weekdays: [], branchIds: [],
      });
    });

    it('propagates a promotion query failure without reading associations', async () => {
      const error = new Error('Promotion query failed');
      connection.execute.mockRejectedValueOnce(error);
      await expect(repository.findOne(42)).rejects.toBe(error);
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });

    it('propagates a weekday query failure and stops before reading cinemas', async () => {
      const error = new Error('Weekday query failed');
      connection.execute.mockResolvedValueOnce({ rows: [row] }).mockRejectedValueOnce(error);
      await expect(repository.findOne(42)).rejects.toBe(error);
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });

    it('propagates a cinema query failure', async () => {
      const error = new Error('Cinema query failed');
      connection.execute
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(error);
      await expect(repository.findOne(42)).rejects.toBe(error);
    });
  });
  describe('update', () => {
    beforeEach(() => { connection.execute.mockResolvedValue({ rowsAffected: 1 }); });
    it('updates the parent and replaces both association sets in one transaction', async () => {
      await expect(repository.update(42, validDto())).resolves.toBe(true);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenNthCalledWith(
        1,
        'ALTER SESSION DISABLE PARALLEL DML',
      );
      expect(connection.execute).toHaveBeenNthCalledWith(2,
        expect.stringContaining('UPDATE promotions SET'),
        expect.objectContaining({
          id: 42, promotionType: 'percentage', promotionAmount: 25,
          beginDate: '2026-11-17', endDate: '2026-12-31',
          beginSeconds: { val: 52200, type: oracledb.NUMBER },
          endSeconds: { val: 64800, type: oracledb.NUMBER },
          projectionFormat: '2D', technology: 'STANDARD',
          promotionTitle: 'Afternoon discount', description: 'Discount description.',
          conditions: 'Subject to availability.', posterPath: '/uploads/posters/promotion.webp',
        }), { autoCommit: false });
      const sql = connection.execute.mock.calls[1][0] as string;
      expect(sql).toContain('WHERE promotion_id = :id');
      expect(sql).toContain("NUMTODSINTERVAL(:endSeconds, 'SECOND')");
      expect(connection.execute).toHaveBeenNthCalledWith(3,
        'DELETE FROM promotion_weekdays WHERE promotion_id = :id', { id: 42 }, { autoCommit: false });
      expect(connection.execute).toHaveBeenNthCalledWith(4,
        'DELETE FROM promotion_cinemas WHERE promotion_id = :id', { id: 42 }, { autoCommit: false });
      expect(connection.executeMany).toHaveBeenNthCalledWith(1,
        expect.stringContaining('INSERT INTO promotion_weekdays'),
        [{ promotionId: 42, dayOfWeek: 2 }, { promotionId: 42, dayOfWeek: 4 }],
        { autoCommit: false, bindDefs: { promotionId: { type: oracledb.NUMBER }, dayOfWeek: { type: oracledb.NUMBER } } });
      expect(connection.executeMany).toHaveBeenNthCalledWith(2,
        expect.stringContaining('INSERT INTO promotion_cinemas'),
        [{ promotionId: 42, branchId: 1 }, { promotionId: 42, branchId: 2 }],
        { autoCommit: false, bindDefs: { promotionId: { type: oracledb.NUMBER }, branchId: { type: oracledb.NUMBER } } });
      expect(connection.execute.mock.invocationCallOrder[3]).toBeLessThan(connection.executeMany.mock.invocationCallOrder[0]);
    });
    it('does not touch associations if the promotion does not exist', async () => {
      connection.execute
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(repository.update(999, validDto())).resolves.toBe(false);
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.executeMany).not.toHaveBeenCalled();
    });
    it.each([undefined, null, []])('clears old weekdays without reinserting when weekdays is %p', async (weekdays) => {
      await repository.update(42, { ...validDto(), weekdays });
      expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM promotion_weekdays'), { id: 42 }, { autoCommit: false });
      expect(connection.executeMany).toHaveBeenCalledTimes(1);
      expect(connection.executeMany).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO promotion_cinemas'), expect.any(Array), expect.any(Object));
    });
    it.each([undefined, null])('clears absent optional fields: %p', async (value) => {
      await repository.update(42, { ...validDto(), beginHour: value, endHour: value, projectionFormat: value, technology: value, conditions: value, posterPath: value });
      expect(connection.execute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        beginSeconds: { val: null, type: oracledb.NUMBER }, endSeconds: { val: null, type: oracledb.NUMBER },
        projectionFormat: null, technology: null, conditions: null, posterPath: null,
      }), { autoCommit: false });
    });
    it('preserves midnight and 24:00 interval boundaries', async () => {
      await repository.update(42, { ...validDto(), beginHour: '00:00', endHour: '24:00' });
      expect(connection.execute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        beginSeconds: { val: 0, type: oracledb.NUMBER }, endSeconds: { val: 86400, type: oracledb.NUMBER },
      }), { autoCommit: false });
    });
    it.each([1, 2, 3,4])('propagates failure at SQL statement %s for transaction rollback', async (stage) => {
      const error = new Error('SQL failed');
      connection.execute.mockReset();
      for (let index = 1; index < stage; index++) connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
      connection.execute.mockRejectedValueOnce(error);
      await expect(repository.update(42, validDto())).rejects.toBe(error);
      expect(connection.execute).toHaveBeenCalledTimes(stage);
      expect(connection.executeMany).not.toHaveBeenCalled();
    });
    it('stops before cinema insertion if weekday insertion fails', async () => {
      const error = new Error('Weekday insert failed');
      connection.executeMany.mockRejectedValueOnce(error);
      await expect(repository.update(42, validDto())).rejects.toBe(error);
      expect(connection.executeMany).toHaveBeenCalledTimes(1);
    });
    it('maps the cinema FK failure to a bad request for transaction rollback', async () => {
      connection.executeMany.mockResolvedValueOnce({ rowsAffected: 2 }).mockRejectedValueOnce({ errorNum: 2291, message: 'ORA-02291: DEVELOPMENT.FK_PROMO_CINEMAS_CINEMA' });
      await expect(repository.update(42, validDto())).rejects.toThrow(BadRequestException);
    });
    it('preserves unrelated cinema insert failures', async () => {
      const error = { errorNum: 2291, message: 'OTHER_CONSTRAINT' };
      connection.executeMany.mockResolvedValueOnce({ rowsAffected: 2 }).mockRejectedValueOnce(error);
      await expect(repository.update(42, validDto())).rejects.toBe(error);
    });
  });

  describe('remove', () => {
  beforeEach(() => {
    connection.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
  });
  it('disables parallel DML, locks the parent and deletes all related rows in one transaction', async () => {
    connection.execute
      .mockResolvedValueOnce({}) // ALTER SESSION
      .mockResolvedValueOnce({ rows: [[42]] }); // SELECT FOR UPDATE
    await expect(repository.remove(42)).resolves.toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledTimes(5);
    expect(connection.execute).toHaveBeenNthCalledWith(
      1,
      'ALTER SESSION DISABLE PARALLEL DML',
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /SELECT promotion_id[\s\S]*FROM promotions[\s\S]*WHERE promotion_id = :id[\s\S]*FOR UPDATE/,
      ),
      { id: 42 },
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM promotion_weekdays WHERE promotion_id = :id',
      { id: 42 },
      { autoCommit: false },
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM promotion_cinemas WHERE promotion_id = :id',
      { id: 42 },
      { autoCommit: false },
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      5,
      'DELETE FROM promotions WHERE promotion_id = :id',
      { id: 42 },
      { autoCommit: false },
    );
    expect(connection.executeMany).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, {}])(
    'does not delete associations when the parent is absent: %p',
    async (result) => {
      connection.execute
        .mockResolvedValueOnce({}) // ALTER SESSION
        .mockResolvedValueOnce(result); // SELECT FOR UPDATE
      await expect(repository.remove(999)).resolves.toBe(false);
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.executeMany).not.toHaveBeenCalled();
    },
  );
  it('deletes the parent even if it has no existing association rows', async () => {
    connection.execute
      .mockResolvedValueOnce({}) // ALTER SESSION
      .mockResolvedValueOnce({ rows: [[42]] })
      .mockResolvedValueOnce({ rowsAffected: 0 })
      .mockResolvedValueOnce({ rowsAffected: 0 })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    await expect(repository.remove(42)).resolves.toBe(true);
    expect(connection.execute).toHaveBeenCalledTimes(5);
  });
  it('waits for the parent lock before deleting any association', async () => {
    let unlock!: (result: { rows: number[][] }) => void;
    const lockPending = new Promise<{ rows: number[][] }>((resolve) => {
      unlock = resolve;
    });
    connection.execute
      .mockResolvedValueOnce({}) // ALTER SESSION
      .mockReturnValueOnce(lockPending); // SELECT FOR UPDATE
    const pending = repository.remove(42);
    await Promise.resolve();
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.execute.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(connection.executeMany).not.toHaveBeenCalled();
    unlock({ rows: [[42]] });
    await expect(pending).resolves.toBe(true);
    expect(connection.execute).toHaveBeenCalledTimes(5);
  });
  it.each([1, 2, 3, 4, 5])(
    'propagates failure at statement %s and stops subsequent statements',
    async (stage) => {
      const error = new Error('Delete failed');
      connection.execute.mockReset();
      for (let index = 1; index < stage; index++) {
        const result =
          index === 1
            ? {} // ALTER SESSION
            : index === 2
              ? { rows: [[42]] } // SELECT FOR UPDATE
              : { rowsAffected: 1 }; // DELETE

        connection.execute.mockResolvedValueOnce(result);
      }
      connection.execute.mockRejectedValueOnce(error);
      await expect(repository.remove(42)).rejects.toBe(error);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(stage);
      expect(connection.executeMany).not.toHaveBeenCalled();
    },
  );
  it('preserves a parent-delete FK error for the transaction handler to roll back', async () => {
    const error = Object.assign(
      new Error('ORA-02292: child record found'),
      { errorNum: 2292 },
    );
    connection.execute
      .mockResolvedValueOnce({}) // ALTER SESSION
      .mockResolvedValueOnce({ rows: [[42]] })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rowsAffected: 2 })
      .mockRejectedValueOnce(error); // DELETE promotion
    await expect(repository.remove(42)).rejects.toBe(error);
    expect(connection.execute).toHaveBeenCalledTimes(5);
  });
});

  describe('findApplicableToMovieFunction', () => {
    const applicable = Object.fromEntries(Object.entries(detail).filter(([key]) => !['weekdays', 'branchIds'].includes(key)));
    it('returns every eligible scalar record without leaking the function context ID', async () => {
      const matches = [applicable, { ...applicable, promotionId: 43, promotionType: 'fixed' as const, promotionAmount: 500 }];
      connection.execute.mockResolvedValueOnce({ rows: matches.map((promotion) => ({ ...promotion, movieFunctionId: 7 })) });
      await expect(repository.findApplicableToMovieFunction(7)).resolves.toEqual(matches);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledWith(expect.any(String), { movieFunctionId: 7 }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      expect(connection.executeMany).not.toHaveBeenCalled();
    });
    it('returns [] for the retained function row when no promotion matches', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [{ movieFunctionId: 7, promotionId: null }] });
      await expect(repository.findApplicableToMovieFunction(7)).resolves.toEqual([]);
    });
    it.each([{ rows: [] }, {}])('returns null for a missing function: %p', async (result) => {
      connection.execute.mockResolvedValueOnce(result);
      await expect(repository.findApplicableToMovieFunction(999)).resolves.toBeNull();
    });
    it('binds the ID and includes each eligibility restriction in the SQL', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [{ movieFunctionId: 7, promotionId: null }] });
      await repository.findApplicableToMovieFunction(7);
      const sql = (connection.execute.mock.calls[0][0] as string).replace(/\s+/g, ' ');
      expect(sql).toContain('JOIN Theaters t ON t.theater_id = mf.theater_id');
      expect(sql).toContain('WHERE mf.movie_function_id = :movieFunctionId');
      expect(sql).toContain('LEFT JOIN promotions p ON');
      expect(sql).toContain('f.function_date BETWEEN TRUNC(p.begin_date) AND TRUNC(p.end_date)');
      expect(sql).toContain('p.begin_hour IS NULL AND p.end_hour IS NULL');
      expect(sql).toContain('p.begin_hour IS NOT NULL AND p.end_hour IS NOT NULL');
      expect(sql).toContain('f.start_offset >= p.begin_hour');
      expect(sql).toContain('f.start_offset < p.end_hour');
      expect(sql).toContain('p.projection_format IS NULL OR p.projection_format = f.projection_format');
      expect(sql).toContain('p.technology IS NULL OR p.technology = f.technology');
      expect(sql).toContain('pc.branch_id = f.branch_id');
      expect(sql).toContain('NOT EXISTS ( SELECT 1 FROM promotion_weekdays');
      expect(sql).toContain('pw.day_of_week = f.weekday');
      expect(sql).toContain("TRUNC(CAST(mf.start_time AS DATE), 'IW') + 1 AS weekday");
      expect(sql).toContain('mf.start_time - CAST(TRUNC(CAST(mf.start_time AS DATE)) AS TIMESTAMP) AS start_offset');
      expect(sql).toContain('ORDER BY p.promotion_id DESC');
      expect(sql).not.toMatch(/SYSDATE|SYSTIMESTAMP|TO_CHAR\([^)]*,\s*'D'/i);
    });
    it('preserves interval boundaries and null restrictions in returned data', async () => {
      const unrestricted = { ...applicable, beginHour: '00:00', endHour: '24:00', projectionFormat: null, technology: null, conditions: null, posterPath: null };
      connection.execute.mockResolvedValueOnce({ rows: [{ ...unrestricted, movieFunctionId: 7 }] });
      await expect(repository.findApplicableToMovieFunction(7)).resolves.toEqual([unrestricted]);
    });
    it('does not mutate rows returned by the driver', async () => {
      const row = Object.freeze({ ...applicable, movieFunctionId: 7 });
      connection.execute.mockResolvedValueOnce({ rows: [row] });
      await repository.findApplicableToMovieFunction(7);
      expect(row.movieFunctionId).toBe(7);
    });
    it('propagates database failures', async () => {
      const error = new Error('Database unavailable');
      connection.execute.mockRejectedValueOnce(error);
      await expect(repository.findApplicableToMovieFunction(7)).rejects.toBe(error);
    });
  });

});

describe('purchase transaction connection', () => {
  it('uses the supplied connection without opening or committing a nested transaction', async () => {
    const db = { transaction: jest.fn() };
    const connection = { execute: jest.fn().mockResolvedValue({ rows: [{ movieFunctionId: 4, promotionId: null }] }) };
    const repository = new PromotionsRepository(db as never);
    expect(await repository.findApplicableToMovieFunction(4, connection as never)).toEqual([]);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
