import oracle from 'oracledb';
import { revokeAccountSessions } from './session-revocation';

describe('Account session revocation', () => {
  const execute = jest.fn();
  const connection = { execute } as unknown as oracle.Connection;
  beforeEach(() => execute.mockReset());

  it.each([
    ['client', 'CLIENT_ID'],
    ['employee', 'EMPLOYEE_ID'],
  ] as const)(
    'revokes %s sessions and pending recoveries in the caller transaction',
    async (type, column) => {
      execute.mockResolvedValue({ rowsAffected: 1 });
      await revokeAccountSessions(connection, type, 42);
      const [sql, binds, options] = execute.mock.calls[0];
      expect(sql).toContain(`ON (r.${column} = source.ACCOUNT_ID)`);
      expect(sql).toContain('RESET_AT = SYSTIMESTAMP');
      for (const field of [
        'TOKEN_HASH',
        'TEMPORARY_HASH',
        'CREDENTIAL_HASH',
        'EMAIL',
        'EXPIRES_AT',
      ])
        expect(sql).toContain(`${field} = NULL`);
      expect(sql).not.toContain('REQUESTED_AT =');
      expect(sql).toContain("SYSTIMESTAMP - INTERVAL '1' MINUTE");
      expect(binds).toEqual({ accountId: { val: 42, type: oracle.NUMBER } });
      expect(options).toEqual({ autoCommit: false });
    },
  );

  it.each([0, 2, undefined])(
    'rejects an uncertain revocation result %p',
    async (rowsAffected) => {
      execute.mockResolvedValue({ rowsAffected });
      await expect(
        revokeAccountSessions(connection, 'client', 42),
      ).rejects.toThrow('single account');
    },
  );

  it('propagates persistence failures to roll back the status change', async () => {
    const failure = new Error('Database unavailable');
    execute.mockRejectedValue(failure);
    await expect(
      revokeAccountSessions(connection, 'employee', 42),
    ).rejects.toBe(failure);
  });
});
