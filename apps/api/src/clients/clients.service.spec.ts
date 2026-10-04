import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { DatabaseService } from '../database/database.service';
import { ClientsRepository } from './clients.repository';

describe('ClientsService', () => {
  let service: ClientsService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let conn: { execute: jest.Mock };
  let repository: { createClient: jest.Mock; insertClient: jest.Mock };

  const client = {
    status: 'ACTIVE',
    id: 1,
    email: 'ana@example.com',
    firstName: 'Ana',
  };

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

  describe('findOrCreateSocial', () => {
    it.each(['GOOGLE', 'FACEBOOK'] as const)(
      'rejects an inactive %s link without recreating or relinking',
      async (provider) => {
        db.query.mockResolvedValueOnce({
          rows: [{ ...client, status: 'INACTIVE' }],
        });
        await expect(
          service.findOrCreateSocial({
            provider,
            providerUserId: 'old-id',
            email: client.email,
            firstName: 'Ana',
            lastName: 'Rojas',
          }),
        ).rejects.toMatchObject({ status: 401 });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.transaction).not.toHaveBeenCalled();
        expect(repository.insertClient).not.toHaveBeenCalled();
      },
    );
    it('rejects linking a new provider to an inactive email', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...client, status: 'INACTIVE' }] });
      await expect(
        service.findOrCreateSocial({
          provider: 'GOOGLE',
          providerUserId: 'new-id',
          email: client.email,
          firstName: 'Ana',
          lastName: 'Rojas',
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });
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
