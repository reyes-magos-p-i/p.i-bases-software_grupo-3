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
});
