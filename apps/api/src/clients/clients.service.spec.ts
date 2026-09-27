import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { DatabaseService } from '../database/database.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let conn: { execute: jest.Mock };

  const client = { id: 1, email: 'ana@example.com', firstName: 'Ana' };

  beforeEach(async () => {
    conn = { execute: jest.fn() };
    db = {
      query: jest.fn(),
      // Runs the work callback with a fake connection, like a real transaction would
      transaction: jest.fn((work: (c: unknown) => Promise<unknown>) => work(conn)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientsService, { provide: DatabaseService, useValue: db }],
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

  describe('createWithLocalCredentials', () => {
    it('inserts the client and its credentials inside a transaction', async () => {
      conn.execute
        .mockResolvedValueOnce({ outBinds: { id: [7] } }) // insertClient
        .mockResolvedValueOnce({}); // credentials insert
      db.query.mockResolvedValue({ rows: [{ ...client, id: 7 }] }); // findById after commit

      const result = await service.createWithLocalCredentials(
        { email: client.email, firstName: 'Ana' },
        'hash',
        'salt',
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(conn.execute).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ...client, id: 7 });
    });

    it('defaults every optional field to null and language to "es" when omitted', async () => {
      conn.execute
        .mockResolvedValueOnce({ outBinds: { id: [8] } })
        .mockResolvedValueOnce({});
      db.query.mockResolvedValue({ rows: [{ ...client, id: 8 }] });

      await service.createWithLocalCredentials({ email: client.email, firstName: 'Ana' }, 'hash', 'salt');

      const insertClientBinds = conn.execute.mock.calls[0][1];
      expect(insertClientBinds).toMatchObject({
        secondName: null,
        firstSurname: null,
        secondSurname: null,
        birthday: null,
        phoneNumber: null,
        gender: null,
        language: 'es',
        terms: 0,
      });
    });

    it('translates a duplicate email UNIQUE violation into ConflictException', async () => {
      db.transaction.mockRejectedValue({ errorNum: 1, message: 'ORA-00001: unique constraint (UQ_CLIENTS_EMAIL) violated' });

      await expect(
        service.createWithLocalCredentials({ email: client.email, firstName: 'Ana' }, 'hash', 'salt'),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated database errors', async () => {
      db.transaction.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.createWithLocalCredentials({ email: client.email, firstName: 'Ana' }, 'hash', 'salt'),
      ).rejects.toThrow('connection lost');
    });

    it('passes all provided optional fields through to the insert', async () => {
      conn.execute
        .mockResolvedValueOnce({ outBinds: { id: [9] } })
        .mockResolvedValueOnce({});
      db.query.mockResolvedValue({ rows: [{ ...client, id: 9 }] });

      await service.createWithLocalCredentials(
        {
          email: client.email,
          firstName: 'Ana',
          secondName: 'Maria',
          firstSurname: 'Perez',
          secondSurname: 'Mora',
          birthday: '2000-05-10',
          phoneNumber: '88881234',
          gender: 'F',
          language: 'en',
          acceptedTerms: true,
        },
        'hash',
        'salt',
      );

      const insertBinds = conn.execute.mock.calls[0][1];
      expect(insertBinds).toMatchObject({
        firstName: 'Ana',
        secondName: 'Maria',
        firstSurname: 'Perez',
        secondSurname: 'Mora',
        birthday: '2000-05-10',
        phoneNumber: '88881234',
        gender: 'F',
        language: 'en',
        terms: 1,
      });
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
      conn.execute
        .mockResolvedValueOnce({ outBinds: { id: [9] } }) // insertClient
        .mockResolvedValueOnce({}); // external credentials insert

      const result = await service.findOrCreateSocial({
        provider: 'GOOGLE',
        providerUserId: 'gid-1',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
      });

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({ ...client, id: 9 });
    });

    it('rethrows non-UNIQUE errors when linking external credentials', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })   // findByExternal miss
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
        .mockResolvedValueOnce({ rows: [] })  // findByExternal miss
        .mockResolvedValueOnce({ rows: [] })  // findByEmail miss
        .mockResolvedValueOnce({ rows: [{ ...client, id: 10 }] }); // findById after commit
      conn.execute
        .mockResolvedValueOnce({ outBinds: { id: [10] } }) // insertClient
        .mockResolvedValueOnce({});  // external credentials insert

      await service.findOrCreateSocial({
        provider: 'FACEBOOK',
        providerUserId: 'fb-1',
        email: 'fallback@example.com',
        firstName: '',   // falsy → uses 'fallback' from email
        lastName: '',    // falsy → [null, null]
      });

      const insertBinds = conn.execute.mock.calls[0][1];
      expect(insertBinds).toMatchObject({
        firstName: 'fallback',
        firstSurname: null,
        secondSurname: null,
      });
    });
  });
});