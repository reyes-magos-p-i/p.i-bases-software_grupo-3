import oracle from 'oracledb';
import {
  PasswordRecoveryRepository,
  type Recovery,
} from './password-recovery.repository';
import { DatabaseService } from '../database/database.service';
import { ClientsRepository } from '../clients/clients.repository';
import { UsersRepository } from '../users/users.repository';

describe('PasswordRecoveryRepository', () => {
  const connection = { execute: jest.fn() };
  const db = { query: jest.fn(), transaction: jest.fn() };
  const clients = { savePassword: jest.fn() };
  const users = { saveEmployeePassword: jest.fn() };
  const account = {
    ID: 7,
    EMAIL: 'ana@example.com',
    FIRST_NAME: 'Ana',
    PASSWORD_HASH: 'old-hash',
  };
  const row = {
    CLIENT_ID: 7,
    EMPLOYEE_ID: null,
    TOKEN_HASH: 'token-hash',
    TEMPORARY_HASH: 'temporary-hash',
    CREDENTIAL_HASH: 'old-hash',
    EMAIL: account.EMAIL,
    EXPIRES_AT: new Date('2030-01-01'),
  };
  const recovery: Recovery = {
    ...account,
    accountType: 'client',
    tokenHash: row.TOKEN_HASH,
    temporaryHash: row.TEMPORARY_HASH,
    expiresAt: row.EXPIRES_AT,
  };
  let repository: PasswordRecoveryRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    db.transaction.mockImplementation(
      (work: (conn: unknown) => Promise<unknown>) => work(connection),
    );
    repository = new PasswordRecoveryRepository(
      db as unknown as DatabaseService,
      clients as unknown as ClientsRepository,
      users as unknown as UsersRepository,
    );
  });

  it.each(['client', 'employee'] as const)(
    'creates a %s recovery under a credential lock with a per-account cooldown',
    async (type) => {
      connection.execute
        .mockResolvedValueOnce({ rows: [account] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await expect(
        repository.request(type, account.EMAIL, 'token-hash', 'temporary-hash'),
      ).resolves.toEqual(account);
      const [sql, binds, options] = connection.execute.mock.calls[0];
      expect(sql).toContain("a.STATUS = 'ACTIVE'");
      expect(sql).toContain('FOR UPDATE OF a.STATUS, c.PASSWORD_HASH');
      expect(sql).toContain(
        type === 'client'
          ? 'CLIENT_EMAIL_VERIFICATIONS'
          : 'EMPLOYEE_LOCAL_CREDENTIALS',
      );
      expect(binds).toEqual({
        email: { val: account.EMAIL, type: oracle.STRING },
        accountId: { val: null, type: oracle.NUMBER },
      });
      expect(options).toEqual({ outFormat: oracle.OUT_FORMAT_OBJECT });
      expect(connection.execute.mock.calls[1][0]).toContain(
        "INTERVAL '1' MINUTE",
      );
      expect(connection.execute).toHaveBeenLastCalledWith(
        expect.stringContaining("INTERVAL '30' MINUTE"),
        {
          accountId: 7,
          tokenHash: 'token-hash',
          temporaryHash: 'temporary-hash',
          credentialHash: 'old-hash',
          email: account.EMAIL,
        },
        { autoCommit: false },
      );
      expect(clients.savePassword).not.toHaveBeenCalled();
    },
  );

  it('does not create requests for missing, inactive, pending or social-only accounts', async () => {
    connection.execute.mockResolvedValue({ rows: [] });
    await expect(
      repository.request('client', account.EMAIL, 'hash', 'secret'),
    ).resolves.toBeNull();
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  it('suppresses repeated requests without replacing the usable secret', async () => {
    connection.execute
      .mockResolvedValueOnce({ rows: [account] })
      .mockResolvedValueOnce({ rows: [[1]] });
    await expect(
      repository.request('client', account.EMAIL, 'hash', 'secret'),
    ).resolves.toBeNull();
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });

  it.each(['client', 'employee'] as const)(
    'loads only a valid %s recovery bound to the current email and credentials',
    async (type) => {
      const record = {
        ...row,
        CLIENT_ID: type === 'client' ? 7 : null,
        EMPLOYEE_ID: type === 'employee' ? 7 : null,
      };
      connection.execute
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({ rows: [account] });
      await expect(repository.find('token-hash')).resolves.toEqual({
        ...recovery,
        accountType: type,
      });
      expect(connection.execute.mock.calls[0][0]).toContain(
        'EXPIRES_AT > SYSTIMESTAMP AND ATTEMPTS < 5',
      );
      expect(connection.execute.mock.calls[1][0]).not.toContain('FOR UPDATE');
    },
  );

  it('rejects unknown, expired, used or attempt-limited tokens', async () => {
    connection.execute.mockResolvedValueOnce({});
    await expect(repository.find('unknown')).resolves.toBeNull();
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { ...account, PASSWORD_HASH: 'changed' },
    { ...account, EMAIL: 'changed@example.com' },
  ])(
    'rejects a recovery when account credentials changed: %p',
    async (current) => {
      connection.execute
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: current ? [current] : [] });
      await expect(repository.find('token-hash')).resolves.toBeNull();
    },
  );

  it('counts incorrect temporary passwords atomically up to five attempts', async () => {
    await expect(repository.failAttempt('hash')).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ATTEMPTS = ATTEMPTS + 1'),
      { tokenHash: 'hash' },
    );
    expect(db.query.mock.calls[0][0]).toContain('ATTEMPTS < 5');
  });

  it('invalidates only the undelivered token, preserving any newer request', async () => {
    await expect(repository.invalidate('old-token')).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE TOKEN_HASH = :tokenHash'),
      { tokenHash: 'old-token' },
    );
  });

  it.each(['client', 'employee'] as const)(
    'updates %s credentials and consumes the secret within the same transaction',
    async (type) => {
      connection.execute
        .mockResolvedValueOnce({ rows: [account] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await expect(
        repository.complete(
          { ...recovery, accountType: type },
          { passwordHash: 'new-hash', salt: 'salt' },
          60,
        ),
      ).resolves.toBe(true);
      const save =
        type === 'client' ? clients.savePassword : users.saveEmployeePassword;
      expect(save).toHaveBeenCalledWith(7, 'new-hash', 'salt', 60, connection);
      expect(connection.execute.mock.calls[1][0]).toContain('FOR UPDATE');
      expect(connection.execute).toHaveBeenLastCalledWith(
        expect.stringContaining('RESET_AT = SYSTIMESTAMP'),
        { tokenHash: 'token-hash' },
        { autoCommit: false },
      );
    },
  );

  it.each([
    [null, row],
    [account, null],
    [{ ...account, EMAIL: 'changed' }, row],
    [{ ...account, PASSWORD_HASH: 'changed' }, row],
    [account, { ...row, CREDENTIAL_HASH: 'changed' }],
    [account, { ...row, TEMPORARY_HASH: 'changed' }],
  ])(
    'refuses a concurrently invalidated recovery: %p',
    async (current, record) => {
      connection.execute
        .mockResolvedValueOnce({ rows: current ? [current] : [] })
        .mockResolvedValueOnce({ rows: record ? [record] : [] });
      await expect(
        repository.complete(
          recovery,
          { passwordHash: 'new-hash', salt: 'salt' },
          90,
        ),
      ).resolves.toBe(false);
      expect(clients.savePassword).not.toHaveBeenCalled();
    },
  );

  it('rejects when the snapshot used for hashing is stale', async () => {
    connection.execute
      .mockResolvedValueOnce({ rows: [account] })
      .mockResolvedValueOnce({ rows: [row] });
    await expect(
      repository.complete(
        { ...recovery, PASSWORD_HASH: 'stale' },
        { passwordHash: 'new', salt: 'salt' },
        90,
      ),
    ).resolves.toBe(false);
    expect(clients.savePassword).not.toHaveBeenCalled();
  });

  it('propagates a credential write failure so the transaction rolls back without consuming the token', async () => {
    connection.execute
      .mockResolvedValueOnce({ rows: [account] })
      .mockResolvedValueOnce({ rows: [row] });
    clients.savePassword.mockRejectedValue(new Error('write failed'));
    await expect(
      repository.complete(recovery, { passwordHash: 'new', salt: 'salt' }, 90),
    ).rejects.toThrow('write failed');
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });

  it.each(['client', 'employee'] as const)(
    'retains sessions for %s accounts without a completed recovery',
    async (type) => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ RESET_AT: null }] });
      await expect(repository.sessionRevoked(type, 7, undefined)).resolves.toBe(
        false,
      );
      await expect(repository.sessionRevoked(type, 7, 123)).resolves.toBe(
        false,
      );
      expect(db.query.mock.calls[0][1]).toEqual({ accountId: 7 });
    },
  );

  it.each([undefined, NaN, '100', 99, 100, 100.5])(
    'revokes old or malformed issue time %p',
    async (issuedAt) => {
      db.query.mockResolvedValue({ rows: [{ RESET_AT: new Date(100_500) }] });
      await expect(
        repository.sessionRevoked('client', 7, issuedAt),
      ).resolves.toBe(true);
    },
  );

  it('accepts a session issued after recovery', async () => {
    db.query.mockResolvedValue({ rows: [{ RESET_AT: new Date(100_500) }] });
    await expect(repository.sessionRevoked('employee', 7, 101)).resolves.toBe(
      false,
    );
  });
});
