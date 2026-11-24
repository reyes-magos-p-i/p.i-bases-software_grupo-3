import { UnauthorizedException } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../../../database/database.service';
import { ClientPromotionalEmailsRepository } from './client-promotional-emails.repository';

describe('ClientPromotionalEmailsRepository', () => {
  const db = { query: jest.fn() };
  const sessionEnded = 'Tu sesión terminó. Inicia sesión nuevamente.';
  let repository: ClientPromotionalEmailsRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new ClientPromotionalEmailsRepository(
      db as unknown as DatabaseService,
    );
  });

  describe('getOptIn', () => {
    it('returns true when the stored opt-in flag is 1', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ PROMO_EMAIL_OPT_IN: 1 }] });
      await expect(repository.getOptIn(7)).resolves.toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        `SELECT PROMO_EMAIL_OPT_IN FROM CLIENTS WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'`,
        { id: { val: 7, type: oracle.NUMBER } },
      );
    });

    it.each([0, null])(
      'returns false when the stored opt-in flag is %p',
      async (flag) => {
        db.query.mockResolvedValueOnce({
          rows: [{ PROMO_EMAIL_OPT_IN: flag }],
        });
        await expect(repository.getOptIn(7)).resolves.toBe(false);
      },
    );

    it.each([{ rows: [] }, { rows: undefined }, {}])(
      'rejects with an unauthorized session error when no active client is found (%p)',
      async (result) => {
        db.query.mockResolvedValueOnce(result);
        const error = await repository.getOptIn(7).catch((e) => e);
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toBe(sessionEnded);
      },
    );

    it('propagates database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('ORA-03113'));
      await expect(repository.getOptIn(7)).rejects.toThrow('ORA-03113');
    });
  });

  describe('setOptIn', () => {
    it.each([
      [true, 1],
      [false, 0],
    ])(
      'stores %p as %p for the active client and returns the new value',
      async (enabled, stored) => {
        db.query.mockResolvedValueOnce({ rowsAffected: 1 });
        await expect(repository.setOptIn(7, enabled)).resolves.toBe(enabled);
        expect(db.query).toHaveBeenCalledWith(
          `UPDATE CLIENTS SET PROMO_EMAIL_OPT_IN = :enabled WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'`,
          {
            id: { val: 7, type: oracle.NUMBER },
            enabled: { val: stored, type: oracle.NUMBER },
          },
        );
        expect(db.query).toHaveBeenCalledTimes(1);
      },
    );

    it.each([{ rowsAffected: 0 }, { rowsAffected: 2 }, {}])(
      'rejects with an unauthorized session error when the update does not affect exactly one client (%p)',
      async (result) => {
        db.query.mockResolvedValueOnce(result);
        const error = await repository.setOptIn(7, true).catch((e) => e);
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toBe(sessionEnded);
      },
    );

    it('propagates database errors without reporting success', async () => {
      db.query.mockRejectedValueOnce(new Error('ORA-03113'));
      await expect(repository.setOptIn(7, false)).rejects.toThrow('ORA-03113');
    });
  });
});
