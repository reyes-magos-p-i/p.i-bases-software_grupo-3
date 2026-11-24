import { DatabaseService } from '../../database/database.service';
import { PromotionalEmailRepository } from './promotional-email.repository';

describe('PromotionalEmailRepository', () => {
  let db: { query: jest.Mock };
  let repository: PromotionalEmailRepository;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    repository = new PromotionalEmailRepository(
      db as unknown as DatabaseService,
    );
  });

  describe('findRecipients', () => {
    it('maps client rows to recipients', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { CLIENT_ID: 1, EMAIL: 'ana@example.com', FIRST_NAME: 'Ana' },
          { CLIENT_ID: 2, EMAIL: 'luis@example.com', FIRST_NAME: 'Luis' },
        ],
      });

      await expect(repository.findRecipients()).resolves.toEqual([
        { clientId: 1, email: 'ana@example.com', name: 'Ana' },
        { clientId: 2, email: 'luis@example.com', name: 'Luis' },
      ]);
    });

    it('only selects active clients who opted in, in a stable order', async () => {
      await repository.findRecipients();

      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain('FROM CLIENTS');
      expect(sql).toContain('PROMO_EMAIL_OPT_IN = 1');
      expect(sql).toContain("STATUS = 'ACTIVE'");
      expect(sql).toContain('ORDER BY CLIENT_ID');
    });

    it('does not pass binds to the query', async () => {
      await repository.findRecipients();

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query.mock.calls[0]).toHaveLength(1);
    });

    it.each([{ rows: [] }, {}])(
      'returns an empty list when there are no recipients: %p',
      async (result) => {
        db.query.mockResolvedValueOnce(result);

        await expect(repository.findRecipients()).resolves.toEqual([]);
      },
    );

    it('propagates query failures', async () => {
      const error = new Error('Recipients query failed');
      db.query.mockRejectedValueOnce(error);

      await expect(repository.findRecipients()).rejects.toBe(error);
    });
  });

  describe('findActivePromotions', () => {
    it('maps promotion rows to title and description', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            PROMOTION_TITLE: 'Estreno',
            PROMOTION_DESCRIPTION: 'Nueva película',
          },
        ],
      });

      await expect(repository.findActivePromotions()).resolves.toEqual([
        { title: 'Estreno', description: 'Nueva película' },
      ]);
    });

    it('only selects promotions whose date range includes today', async () => {
      await repository.findActivePromotions();

      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain('FROM promotions');
      expect(sql).toContain('TRUNC(SYSDATE) BETWEEN begin_date AND end_date');
      expect(sql).toContain('ORDER BY begin_date, promotion_id');
    });

    it.each([{ rows: [] }, {}])(
      'returns an empty list when no promotion is active: %p',
      async (result) => {
        db.query.mockResolvedValueOnce(result);

        await expect(repository.findActivePromotions()).resolves.toEqual([]);
      },
    );

    it('propagates query failures', async () => {
      const error = new Error('Promotions query failed');
      db.query.mockRejectedValueOnce(error);

      await expect(repository.findActivePromotions()).rejects.toBe(error);
    });
  });

  describe('claimMonth', () => {
    it('claims the month with an insert that is committed right away', async () => {
      await expect(repository.claimMonth('2026-12')).resolves.toBe(true);

      const [sql, binds] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO PROMOTIONAL_EMAIL_RUNS');
      expect(binds).toEqual({ monthKey: '2026-12' });
    });

    it('reports a month that another run already claimed (ORA-00001)', async () => {
      db.query.mockRejectedValueOnce(
        Object.assign(new Error('ORA-00001: unique constraint'), {
          errorNum: 1,
        }),
      );

      await expect(repository.claimMonth('2026-12')).resolves.toBe(false);
    });

    it('propagates other database failures so the month is retried', async () => {
      db.query.mockRejectedValueOnce(new Error('ORA-00942'));

      await expect(repository.claimMonth('2026-12')).rejects.toThrow(
        'ORA-00942',
      );
    });
  });
});
