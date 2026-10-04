import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import oracle from 'oracledb';
import { ClientsService } from './clients.service';
import { DatabaseService } from '../database/database.service';
import { ClientsRepository } from './clients.repository';

describe('ClientsService', () => {
  let service: ClientsService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let conn: { execute: jest.Mock };
  let repository: { createClient: jest.Mock; insertClient: jest.Mock };

  const client = { id: 1, email: 'ana@example.com', firstName: 'Ana' };

  beforeEach(async () => {
    conn = { execute: jest.fn() };
    repository = { createClient: jest.fn(), insertClient: jest.fn() };
    db = {
      query: jest.fn(),
      // Runs the work callback with a fake connection, like a real transaction would
      transaction: jest.fn((work: (c: unknown) => Promise<unknown>) =>
        work(conn),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: DatabaseService, useValue: db },
        { provide: ClientsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  describe('findById / findByEmail', () => {
    it('returns null when no row is found', async () => {
      db.query.mockResolvedValue({ rows: [] });

      expect(await service.findById(1)).toBeNull();
      expect(await service.findByEmail('nope@x.com')).toBeNull();
    });

    it('returns the first row when found', async () => {
      db.query.mockResolvedValue({ rows: [client] });

      expect(await service.findByEmail('ana@example.com')).toEqual(client);
    });
  });

  describe('findByExternal', () => {
    it('queries by provider and providerUserId', async () => {
      db.query.mockResolvedValue({ rows: [client] });

      const result = await service.findByExternal('GOOGLE', 'gid-1');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('Client_external_credentials'),
        { provider: 'GOOGLE', providerUserId: 'gid-1' },
      );
      expect(result).toEqual(client);
    });
  });

  describe('findWithLocalCredentials', () => {
    it('returns null when the client has no local credentials row', async () => {
      db.query.mockResolvedValue({ rows: [] });

      expect(await service.findWithLocalCredentials('nope@x.com')).toBeNull();
    });

    it('returns the client with its password hash when found', async () => {
      const withHash = { ...client, passwordHash: 'hash' };
      db.query.mockResolvedValue({ rows: [withHash] });

      const result = await service.findWithLocalCredentials(client.email);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('Client_local_credentials'),
        { email: client.email },
      );
      expect(result).toEqual(withHash);
    });
  });

  describe('pending email verification', () => {
    it('creates a pending client with its verification token and returns the public client', async () => {
      repository.createClient.mockResolvedValue(12);
      db.query.mockResolvedValue({ rows: [{ ...client, id: 12 }] });

      await expect(
        service.createPendingWithLocalCredentials(
          { email: client.email, firstName: 'Ana' },
          'password-hash',
          'salt',
          'token-hash',
          30,
        ),
      ).resolves.toEqual({ ...client, id: 12 });
      expect(repository.createClient).toHaveBeenCalledWith(
        {
          email: client.email,
          firstName: 'Ana',
          language: 'es',
          passwordHash: 'password-hash',
          salt: 'salt',
        },
        { tokenHash: 'token-hash', expiresInMinutes: 30 },
      );
    });

    it('finds a pending local client by email or returns null when absent', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [client] })
        .mockResolvedValueOnce({});

      await expect(
        service.findPendingLocalClientByEmail(client.email),
      ).resolves.toEqual(client);
      await expect(
        service.findPendingLocalClientByEmail('missing@example.com'),
      ).resolves.toBeNull();
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('JOIN CLIENT_EMAIL_VERIFICATIONS'),
        { email: client.email },
      );
    });

    it('rotates one verification and reports an unexpected row count', async () => {
      db.query
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(
        service.replaceEmailVerification(42, 'hash', 20),
      ).resolves.toBeUndefined();
      await expect(
        service.replaceEmailVerification(42, 'hash', 20),
      ).rejects.toThrow('Oracle did not rotate a single email verification.');
    });

    it.each([
      { rowsAffected: 0, outBinds: { clientId: [42] } },
      { rowsAffected: 1, outBinds: { clientId: 42 } },
      { rowsAffected: 1, outBinds: { clientId: [0] } },
      { rowsAffected: 1, outBinds: { clientId: ['42'] } },
    ])(
      'rejects an unavailable or invalid verification row: %p',
      async (result) => {
        conn.execute.mockResolvedValueOnce(result);
        await expect(
          service.consumeEmailVerification('token-hash'),
        ).resolves.toBeNull();
        expect(conn.execute).toHaveBeenCalledTimes(1);
      },
    );

    it('returns null when a consumed token no longer has a corresponding client', async () => {
      conn.execute
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { clientId: [42] },
        })
        .mockResolvedValueOnce({});
      await expect(
        service.consumeEmailVerification('token-hash'),
      ).resolves.toBeNull();
    });

    it('returns the client after consuming an unexpired verification token', async () => {
      conn.execute
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { clientId: [42] },
        })
        .mockResolvedValueOnce({ rows: [client] });
      await expect(
        service.consumeEmailVerification('token-hash'),
      ).resolves.toEqual(client);
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM CLIENT_EMAIL_VERIFICATIONS'),
        expect.objectContaining({
          tokenHash: { val: 'token-hash', type: oracle.STRING },
          clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
        }),
        { autoCommit: false },
      );
    });

    it('checks pending status and clears a verification by client id', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ pending: 1 }] })
        .mockResolvedValueOnce({});
      await expect(service.isEmailVerificationPending(42)).resolves.toBe(true);
      await expect(service.isEmailVerificationPending(43)).resolves.toBe(false);
      await service.clearPendingEmailVerification(42);
      expect(db.query).toHaveBeenLastCalledWith(
        'DELETE FROM CLIENT_EMAIL_VERIFICATIONS WHERE CLIENT_ID = :clientId',
        { clientId: 42 },
      );
    });
  });

  describe('createWithLocalCredentials', () => {
    it('delegates to the shared repository and returns the existing public client contract', async () => {
      repository.createClient.mockResolvedValue(7);
      db.query.mockResolvedValue({ rows: [{ ...client, id: 7 }] });
      const result = await service.createWithLocalCredentials(
        { email: client.email, firstName: 'Ana' },
        'hash',
        'salt',
      );
      expect(repository.createClient).toHaveBeenCalledWith({
        email: client.email,
        firstName: 'Ana',
        language: 'es',
        passwordHash: 'hash',
        salt: 'salt',
      });
      expect(result).toEqual({ ...client, id: 7 });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(conn.execute).not.toHaveBeenCalled();
      expect(repository.createClient.mock.invocationCallOrder[0]).toBeLessThan(
        db.query.mock.invocationCallOrder[0],
      );
    });

    it('preserves optional fields, address, terms and explicit language', async () => {
      const data = {
        email: client.email,
        firstName: 'Ana',
        secondName: null,
        firstSurname: 'Perez',
        secondSurname: 'Mora',
        birthday: '2000-05-10',
        phoneNumber: '88881234',
        gender: 'F',
        language: 'en',
        acceptedTerms: true,
        address: { districtId: 7, details: 'Casa azul' },
      };
      repository.createClient.mockResolvedValue(9);
      db.query.mockResolvedValue({ rows: [{ ...client, id: 9 }] });
      await service.createWithLocalCredentials(data, 'hash', 'salt');
      expect(repository.createClient).toHaveBeenCalledWith({
        ...data,
        passwordHash: 'hash',
        salt: 'salt',
      });
    });

    it.each([
      new ConflictException('Duplicate email'),
      new Error('Connection lost'),
    ])(
      'propagates persistence errors without reading or retrying a client',
      async (failure) => {
        repository.createClient.mockRejectedValue(failure);
        await expect(
          service.createWithLocalCredentials(
            { email: client.email, firstName: 'Ana' },
            'hash',
            'salt',
          ),
        ).rejects.toBe(failure);
        expect(repository.createClient).toHaveBeenCalledTimes(1);
        expect(db.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('deleteExpiredPendingClients', () => {
    it('deletes only pending clients older than the retention period transactionally', async () => {
      conn.execute
        .mockResolvedValueOnce({ rows: [{ clientId: 42 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 1 });

      await service.deleteExpiredPendingClients();

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(conn.execute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("NUMTODSINTERVAL(:retentionDays, 'DAY')"),
        { retentionDays: 7 },
        expect.objectContaining({ autoCommit: false }),
      );
      expect(conn.execute).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM CLIENT_LOCAL_CREDENTIALS WHERE CLIENT_ID = :clientId',
        { clientId: { val: 42, type: oracle.NUMBER } },
        { autoCommit: false },
      );
      expect(conn.execute.mock.calls[2][0]).toContain('DELETE FROM CLIENTS');
      expect(conn.execute.mock.calls[2][1]).toEqual({
        clientId: { val: 42, type: oracle.NUMBER },
      });
    });

    it('uses the email to purge an expired pending registration before re-registering', async () => {
      conn.execute.mockResolvedValueOnce({ rows: [] });

      await service.deleteExpiredPendingClientByEmail('ana@example.com');

      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND EXISTS'),
        { retentionDays: 7, email: 'ana@example.com' },
        expect.objectContaining({ autoCommit: false }),
      );
      expect(conn.execute).toHaveBeenCalledTimes(1);
    });

    it('does not delete a row when Oracle returns an invalid pending client id', async () => {
      conn.execute.mockResolvedValueOnce({ rows: [{ clientId: '42' }] });
      await expect(service.deleteExpiredPendingClients()).rejects.toThrow(
        'Oracle returned an invalid pending client identifier.',
      );
      expect(conn.execute).toHaveBeenCalledTimes(1);
    });

    it('requires exactly one credential deletion before deleting a pending client', async () => {
      conn.execute
        .mockResolvedValueOnce({ rows: [{ clientId: 42 }] })
        .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(service.deleteExpiredPendingClients()).rejects.toThrow(
        'Oracle did not delete a single pending credential.',
      );
      expect(conn.execute).toHaveBeenCalledTimes(2);
    });

    it('requires exactly one pending client deletion after removing credentials', async () => {
      conn.execute
        .mockResolvedValueOnce({ rows: [{ clientId: 42 }] })
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(service.deleteExpiredPendingClients()).rejects.toThrow(
        'Oracle did not delete a single expired pending client.',
      );
    });

    it('safely handles a cleanup query with no rows', async () => {
      conn.execute.mockResolvedValueOnce({});
      await expect(
        service.deleteExpiredPendingClients(),
      ).resolves.toBeUndefined();
      expect(conn.execute).toHaveBeenCalledTimes(1);
    });

    it('does not extend the seven-day pending-account retention when rotating the link', async () => {
      db.query.mockResolvedValue({ rowsAffected: 1 });

      await service.replaceEmailVerification(42, 'a'.repeat(64), 30);

      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain('target.EXPIRES_AT');
      expect(sql).not.toContain('target.CREATED_AT = SYSTIMESTAMP');
    });
  });

  describe('findOrCreateSocial', () => {
    it('returns the client already linked to this provider account', async () => {
      db.query.mockResolvedValueOnce({ rows: [client] }); // findByExternal hit

      const result = await service.findOrCreateSocial({
        provider: 'GOOGLE',
        providerUserId: 'gid-1',
        email: client.email,
        firstName: 'Ana',
        lastName: '',
      });

      expect(result).toEqual(client);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('links an existing account found by email, without creating a new client', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByExternal miss
        .mockResolvedValueOnce({ rows: [client] }) // findByEmail hit
        .mockResolvedValueOnce({}); // external credentials insert

      const result = await service.findOrCreateSocial({
        provider: 'GOOGLE',
        providerUserId: 'gid-1',
        email: client.email,
        firstName: 'Ana',
        lastName: '',
      });

      expect(result).toEqual(client);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the account is already linked to another account of the same provider', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByExternal miss
        .mockResolvedValueOnce({ rows: [client] }) // findByEmail hit
        .mockRejectedValueOnce({ errorNum: 1 }); // external credentials insert conflict

      await expect(
        service.findOrCreateSocial({
          provider: 'GOOGLE',
          providerUserId: 'gid-1',
          email: client.email,
          firstName: 'Ana',
          lastName: '',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a brand new client when no link or email match exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByExternal miss
        .mockResolvedValueOnce({ rows: [] }) // findByEmail miss
        .mockResolvedValueOnce({ rows: [{ ...client, id: 9 }] }); // findById after commit
      repository.insertClient.mockResolvedValue(9);
      conn.execute.mockResolvedValue({});

      const result = await service.findOrCreateSocial({
        provider: 'GOOGLE',
        providerUserId: 'gid-1',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
      });

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({ ...client, id: 9 });
      expect(repository.insertClient).toHaveBeenCalledWith(
        conn,
        expect.objectContaining({ language: 'es' }),
      );
      expect(conn.execute).toHaveBeenCalledTimes(1);
      expect(repository.createClient).not.toHaveBeenCalled();
    });

    it('rethrows non-UNIQUE errors when linking external credentials', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByExternal miss
        .mockResolvedValueOnce({ rows: [client] }) // findByEmail hit
        .mockRejectedValueOnce(new Error('connection lost')); // non-UNIQUE error

      await expect(
        service.findOrCreateSocial({
          provider: 'GOOGLE',
          providerUserId: 'gid-1',
          email: client.email,
          firstName: 'Ana',
          lastName: '',
        }),
      ).rejects.toThrow('connection lost');
    });

    it('falls back to email prefix when firstName is empty and skips lastName split when absent', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByExternal miss
        .mockResolvedValueOnce({ rows: [] }) // findByEmail miss
        .mockResolvedValueOnce({ rows: [{ ...client, id: 10 }] }); // findById after commit
      repository.insertClient.mockResolvedValue(10);
      conn.execute.mockResolvedValue({});

      await service.findOrCreateSocial({
        provider: 'FACEBOOK',
        providerUserId: 'fb-1',
        email: 'fallback@example.com',
        firstName: '', // falsy → uses 'fallback' from email
        lastName: '', // falsy → [null, null]
      });

      const insertBinds = repository.insertClient.mock.calls[0][1];
      expect(insertBinds).toMatchObject({
        firstName: 'fallback',
        firstSurname: null,
        secondSurname: null,
      });
    });
  });
});
