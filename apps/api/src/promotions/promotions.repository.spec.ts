import * as oracledb from 'oracledb';

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
  });

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
    'skips weekday inserts when weekdays is %p',
    async (weekdays) => {
      await repository.create({
        ...validDto(),
        weekdays,
      });

      expect(connection.executeMany).not.toHaveBeenCalled();
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
});
