jest.mock('oracledb', () => ({
  ...jest.requireActual('oracledb'),
  createPool: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import type { NewClientWithLocalCredentials } from './client.model';
import { ClientsRepository } from './clients.repository';
import { ListClientsQueryDto } from '../users/dto/list-users-query.dto';

describe('ClientsRepository', () => {
  let module: TestingModule;
  let repository: ClientsRepository;
  const connection = {
    execute: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    close: jest.fn(),
  };
  const pool = {
    getConnection: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    connection.execute.mockResolvedValue({ rows: [] });
    connection.close.mockResolvedValue(undefined);
    connection.commit.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
    pool.getConnection.mockResolvedValue(connection);

    (oracle.createPool as jest.Mock<Promise<oracle.Pool>>).mockResolvedValue(
      pool as unknown as oracle.Pool,
    );
    module = await Test.createTestingModule({
      providers: [
        ClientsRepository,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
            getOrThrow: (key: string) => 'test-' + key,
          },
        },
      ],
    }).compile();

    await module.init();
    jest.clearAllMocks();
    repository = module.get(ClientsRepository);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('deactivateClient', () => {
    it('updates only the status and commits exactly one client', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await repository.deactivateClient(42);
      expect(connection.execute).toHaveBeenCalledWith(
        "UPDATE CLIENTS SET STATUS = 'INACTIVE' WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'",
        { id: { val: 42, type: oracle.NUMBER } },
        { autoCommit: false },
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        1,
        'SELECT STATUS FROM CLIENTS WHERE CLIENT_ID = :id FOR UPDATE',
        { id: { val: 42, type: oracle.NUMBER } },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.commit).toHaveBeenCalledTimes(1);
    });
    it('reports nonexistent clients without committing', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });
      await expect(repository.deactivateClient(42)).rejects.toMatchObject({
        status: 404,
      });
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });
    it('distinguishes an already inactive client without updating it', async () => {
      connection.execute.mockResolvedValueOnce({
        rows: [{ STATUS: 'INACTIVE' }],
      });
      await expect(repository.deactivateClient(42)).rejects.toMatchObject({
        status: 409,
        message: 'El cliente ya está desactivado.',
      });
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    });
    it.each(['UNKNOWN', null, undefined])(
      'rejects unexpected stored status %p',
      async (status) => {
        connection.execute.mockResolvedValueOnce({
          rows: [{ STATUS: status }],
        });
        await expect(repository.deactivateClient(42)).rejects.toThrow(
          'Invalid client status.',
        );
        expect(connection.execute).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
      },
    );
    it.each([0, 2, undefined])(
      'rolls back unexpected persistence outcome %p',
      async (rowsAffected) => {
        connection.execute
          .mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] })
          .mockResolvedValueOnce({ rowsAffected });
        await expect(repository.deactivateClient(42)).rejects.toThrow(
          'single client',
        );
        expect(connection.rollback).toHaveBeenCalledTimes(1);
      },
    );
    it('keeps an inactive client email reserved', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [{ FOUND: 1 }] });
      await expect(
        repository.clientEmailExists('inactive@example.com'),
      ).resolves.toBe(true);
      expect(connection.execute).toHaveBeenCalledWith(
        'SELECT 1 AS FOUND FROM CLIENTS WHERE EMAIL = :email AND ROWNUM = 1',
        { email: 'inactive@example.com' },
        expect.anything(),
      );
    });
  });
  describe('updateClient', () => {
    beforeEach(() => {
      connection.execute.mockResolvedValueOnce({
        rows: [{ EMAIL: 'old@example.com' }],
      });
    });
    it('updates selected name fields without changing other columns', async () => {
      connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
      await repository.updateClient(42, {
        firstName: 'María',
        secondName: null,
        firstSurname: 'Núñez',
        secondSurname: null,
      });
      const [sql, binds] = connection.execute.mock.calls[1];
      expect(sql).toBe(
        "UPDATE CLIENTS SET FIRST_NAME = :firstName, SECOND_NAME = :secondName, FIRST_SURNAME = :firstSurname, SECOND_SURNAME = :secondSurname WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'",
      );
      expect(binds.firstName.val).toBe('María');
      expect(binds.secondName.val).toBeNull();
      expect(binds.secondSurname.val).toBeNull();
      expect(binds.firstSurname.val).toBe('Núñez');
      expect(binds).not.toHaveProperty('phoneNumber');
      expect(connection.commit).toHaveBeenCalledTimes(1);
    });
    it('creates a private replacement address and updates only selected client fields', async () => {
      connection.execute.mockResolvedValueOnce({
        rowsAffected: 1,
        outBinds: { addressId: [55] },
      });
      connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
      expect(
        await repository.updateClient(42, {
          phoneNumber: '88888888',
          address: { districtId: 7, details: 'Casa azul' },
        }),
      ).toEqual({ id: 42, email: 'old@example.com', role: 'CLIENT' });
      const [sql, binds, options] = connection.execute.mock.calls[2];
      expect(sql).toBe(
        "UPDATE CLIENTS SET PHONE_NUMBER = :phoneNumber, ID_ADDRESS = :addressId WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'",
      );
      expect(binds.id.val).toBe(42);
      expect(binds.addressId.val).toBe(55);
      expect(options.autoCommit).toBe(false);
      expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(
        connection.execute.mock.calls.some(([statement]: [string]) =>
          /UPDATE ADDRESSES|DELETE|GENDER|PASSWORD|FIRST_NAME/u.test(statement),
        ),
      ).toBe(false);
      expect(connection.commit).toHaveBeenCalledTimes(1);
    });
    it('allows explicitly clearing optional fields', async () => {
      connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
      await repository.updateClient(42, { address: null, phoneNumber: null });
      const [, binds] = connection.execute.mock.calls[1];
      expect(binds.addressId.val).toBeNull();
      expect(binds.phoneNumber.val).toBeNull();
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });
    it('checks email uniqueness while excluding the selected client', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      expect(
        await repository.updateClient(42, { email: 'new@example.com' }),
      ).toEqual({ id: 42, email: 'new@example.com', role: 'CLIENT' });
      expect(connection.execute.mock.calls[1][1]).toEqual({
        email: 'new@example.com',
        id: 42,
      });
      expect(connection.execute.mock.calls[2][0]).not.toContain('PHONE_NUMBER');
    });
    it('does not write when the client no longer exists', async () => {
      connection.execute.mockReset().mockResolvedValue({});
      await expect(
        repository.updateClient(42, { phoneNumber: null }),
      ).rejects.toMatchObject({ status: 404 });
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    });
    it('rolls back a duplicate email', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [1] });
      await expect(
        repository.updateClient(42, { email: 'other@example.com' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(connection.commit).not.toHaveBeenCalled();
    });
    it.each([
      [
        { errorNum: 1, message: 'ORA-00001: (PRODUCTION.UQ_CLIENTS_EMAIL)' },
        409,
      ],
      [{ errorNum: 2291 }, 400],
    ])(
      'translates known Oracle errors after rollback',
      async (failure, expected) => {
        connection.execute.mockRejectedValueOnce(failure);
        await expect(
          repository.updateClient(42, { phoneNumber: '88888888' }),
        ).rejects.toMatchObject({ status: expected });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
      },
    );
    it('rolls back an unexpected update count', async () => {
      connection.execute.mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(
        repository.updateClient(42, { phoneNumber: null }),
      ).rejects.toThrow('single client');
      expect(connection.commit).not.toHaveBeenCalled();
    });
    it('preserves unknown Oracle failures', async () => {
      const failure = { errorNum: 1, message: 'another constraint' };
      connection.execute.mockRejectedValueOnce(failure);
      await expect(
        repository.updateClient(42, { phoneNumber: null }),
      ).rejects.toBe(failure);
    });
  });

  describe('findClientDetailById', () => {
    const row = {
      ID: 42,
      FIRST_NAME: 'Ana',
      SECOND_NAME: 'María',
      FIRST_SURNAME: 'Núñez',
      SECOND_SURNAME: 'Solano',
      BIRTHDAY: '2000-02-29',
      PHONE_NUMBER: '88888888',
      EMAIL: 'ana@example.com',
      GENDER: 'N',
      LANGUAGE: 'es',
      CREATED_AT: null,
      ADDRESS_ID: 7,
      ADDRESS_DETAILS: 'Casa azul',
      DISTRICT_ID: 3,
      DISTRICT_NAME: 'Carmen',
      CANTON_ID: 2,
      CANTON_NAME: 'San José',
      PROVINCE_ID: 1,
      PROVINCE_NAME: 'San José',
      PASSWORD_HASH: 'private',
      ACCESS_TOKEN: 'private',
    };
    it('returns individual fields and the full address without credentials', async () => {
      connection.execute.mockResolvedValue({ rows: [row] });
      expect(await repository.findClientDetailById(42)).toEqual({
        id: 42,
        role: 'CLIENT',
        firstName: 'Ana',
        secondName: 'María',
        firstSurname: 'Núñez',
        secondSurname: 'Solano',
        birthday: '2000-02-29',
        phoneNumber: '88888888',
        email: 'ana@example.com',
        gender: 'N',
        language: 'es',
        createdAt: null,
        address: {
          id: 7,
          details: 'Casa azul',
          districtId: 3,
          districtName: 'Carmen',
          cantonId: 2,
          cantonName: 'San José',
          provinceId: 1,
          provinceName: 'San José',
        },
      });
      const [sql, binds] = connection.execute.mock.calls[0] as [
        string,
        oracle.BindParameters,
      ];
      expect(sql).toContain('WHERE c.CLIENT_ID = :id');
      expect(sql).toContain('LEFT JOIN PROVINCES');
      expect(sql).toContain("TO_CHAR(c.BIRTHDAY, 'YYYY-MM-DD')");
      expect(sql).not.toMatch(/PASSWORD|CREDENTIALS|ACCESS_TOKEN/u);
      expect(binds).toEqual({ id: { val: 42, type: oracle.NUMBER } });
    });
    it('preserves absent optional fields and address', async () => {
      connection.execute.mockResolvedValue({
        rows: [{ ...row, ADDRESS_ID: null, SECOND_NAME: null, BIRTHDAY: null }],
      });
      expect(await repository.findClientDetailById(42)).toMatchObject({
        address: null,
        secondName: null,
        birthday: null,
      });
    });
    it.each([{ rows: [] }, {}])(
      'returns null for a missing client: %p',
      async (result) => {
        connection.execute.mockResolvedValue(result);
        expect(await repository.findClientDetailById(42)).toBeNull();
      },
    );
    it('propagates read failures and releases the connection', async () => {
      connection.execute.mockRejectedValue(new Error('Unavailable'));
      await expect(repository.findClientDetailById(42)).rejects.toThrow(
        'Unavailable',
      );
      expect(connection.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('listClients', () => {
    it('matches first names and surnames even when a second name is between them', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repository.listClients(
        Object.assign(new ListClientsQueryDto(), { search: 'Ana Núñez' }),
      );
      const [sql, binds] = connection.execute.mock.calls[0] as [
        string,
        Record<string, oracle.BindParameter>,
      ];
      expect(sql).toContain("LIKE :name0 ESCAPE '\\' AND LOWER(");
      expect(binds.name0.val).toBe('%ana%');
      expect(binds.name1.val).toBe('%núñez%');
    });
    it('searches the full name with parameters and exposes only listing fields', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ TOTAL: 11 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              ID: 42,
              NAME: 'Ana María Núñez',
              EMAIL: 'ana@example.com',
              PHONE_NUMBER: null,
              CREATED_AT: null,
              PASSWORD_HASH: 'private',
            },
          ],
        });
      const result = await repository.listClients(
        Object.assign(new ListClientsQueryDto(), {
          search: "O'Connor%_\\",
          page: 2,
          sortBy: 'name',
          sortDirection: 'desc',
        }),
      );
      expect(result).toEqual({
        items: [
          {
            id: 42,
            name: 'Ana María Núñez',
            email: 'ana@example.com',
            phoneNumber: null,
            createdAt: null,
          },
        ],
        total: 11,
        page: 2,
        pageSize: 10,
        totalPages: 2,
      });
      const [sql, binds] = connection.execute.mock.calls[1] as [
        string,
        Record<string, oracle.BindParameter>,
      ];
      expect(sql).toContain('REGEXP_REPLACE');
      expect(sql).toContain('DESC NULLS LAST, c.CLIENT_ID ASC');
      expect(sql).not.toContain("O'Connor");
      expect(binds.search.val).toBe("%o'connor\\%\\_\\\\%");
      expect(binds.name0.val).toBe(binds.search.val);
      expect(sql).toContain(String.raw`LIKE :search ESCAPE '\'`);
      expect(sql).toContain(String.raw`LIKE :name0 ESCAPE '\'`);
      expect(binds.offset.val).toBe(10);
      expect(connection.execute.mock.calls[0][1]).toEqual({
        search: binds.search,
        name0: binds.name0,
      });
      for (const statement of [connection.execute.mock.calls[0][0], sql]) {
        expect(statement).toContain("WHERE c.STATUS = 'ACTIVE' AND ((");
        expect(statement).toContain(String.raw`LIKE :name0 ESCAPE '\'`);
        expect(statement).toContain(String.raw`LIKE :search ESCAPE '\'`);
      }
    });
    it.each([{ rows: [{ TOTAL: 0 }] }, {}])(
      'returns an empty successful result: %p',
      async (count) => {
        connection.execute.mockResolvedValue(count);
        expect(await repository.listClients(new ListClientsQueryDto())).toEqual(
          { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 },
        );
        expect(connection.execute).toHaveBeenCalledTimes(1);
      },
    );
    it.each(['id', 'email', 'createdAt'])(
      'orders by %s and clamps pages after the last result',
      async (sortBy) => {
        connection.execute
          .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
          .mockResolvedValueOnce({ rows: [] });
        const result = await repository.listClients(
          Object.assign(new ListClientsQueryDto(), { sortBy, page: 20 }),
        );
        expect(result.page).toBe(1);
        expect(connection.execute.mock.calls[1][0]).toContain(
          'ASC NULLS LAST, c.CLIENT_ID ASC',
        );
      },
    );
    it('fails rather than returning a partial result if the page query fails', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
        .mockRejectedValueOnce(new Error('Query unavailable'));
      await expect(
        repository.listClients(new ListClientsQueryDto()),
      ).rejects.toThrow('Query unavailable');
      expect(connection.close).toHaveBeenCalledTimes(2);
    });
  });

  const insertedAddress = { rowsAffected: 1, outBinds: { addressId: [7] } };

  it.each([true, false, undefined])(
    'binds gender and explicit terms acceptance (%p) without inventing acceptance',
    async (acceptedTerms) => {
      connection.execute
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { clientId: [42] },
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await repository.createClient({
        email: 'cliente@example.com',
        firstName: 'Ana',
        gender: 'F',
        acceptedTerms,
        passwordHash: 'test-hash',
        salt: 'test-salt',
      });
      const [sql, binds] = connection.execute.mock.calls[0];
      expect(sql).toContain('CASE WHEN :terms = 1 THEN SYSTIMESTAMP END');
      expect(binds.gender).toEqual({ val: 'F', type: oracle.STRING });
      expect(binds.terms).toEqual({
        val: acceptedTerms === true ? 1 : 0,
        type: oracle.NUMBER,
      });
      expect(sql).not.toContain('test-hash');
    },
  );

  it.each([
    'ORA-00001: unique constraint (PRODUCTION.UQ_CLIENTS_EMAIL) violated',
    'ORA-00001: unique constraint ("PRODUCTION"."UQ_CLIENTS_EMAIL") violated',
  ])(
    'rolls back the address and reports a duplicate email race: %s',
    async (message) => {
      connection.execute
        .mockResolvedValueOnce(insertedAddress)
        .mockRejectedValueOnce({ errorNum: 1, message });
      await expect(
        repository.createClient({
          email: 'cliente@example.com',
          firstName: 'Ana',
          address: { districtId: 7 },
          passwordHash: 'test-hash',
          salt: 'test-salt',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.execute).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { errorNum: 1, message: 'OTHER_UQ_CLIENTS_EMAIL' },
    { errorNum: 1, message: 'UQ_CLIENTS_EMAIL_OTHER' },
    { errorNum: 1 },
    { errorNum: 2291, message: 'FK_CLIENT_ADDRESS' },
    null,
  ])('does not misclassify unrelated persistence errors: %p', async (error) => {
    connection.execute.mockRejectedValueOnce(error);
    await expect(
      repository.createClient({
        email: 'cliente@example.com',
        firstName: 'Ana',
        passwordHash: 'test-hash',
        salt: 'test-salt',
      }),
    ).rejects.toBe(error);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  describe('createClient', () => {
    const client: NewClientWithLocalCredentials = {
      email: 'cliente@example.com',
      firstName: 'Ana',
      passwordHash: 'test-password-hash',
      salt: 'test-salt',
    };
    const insertedClient = {
      rowsAffected: 1,
      outBinds: { clientId: [42] },
    };

    beforeEach(() => {
      connection.execute
        .mockResolvedValueOnce(insertedClient)
        .mockResolvedValueOnce({ rowsAffected: 1 });
    });

    it('inserts the complete profile and credentials before committing on the same connection', async () => {
      const data: NewClientWithLocalCredentials = {
        ...client,
        secondName: 'María',
        firstSurname: 'Núñez',
        secondSurname: 'Solano',
        birthday: '2000-02-29',
        phoneNumber: '+506 8888-8888',
        address: { districtId: 71, details: 'Casa azul' },
        language: 'es-CR',
      };

      connection.execute
        .mockReset()
        .mockResolvedValueOnce(insertedAddress)
        .mockResolvedValueOnce(insertedClient)
        .mockResolvedValueOnce({ rowsAffected: 1 });

      await expect(repository.createClient(data)).resolves.toBe(42);

      expect(pool.getConnection).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(3);
      const profileSql: string = connection.execute.mock.calls[1][0];
      expect(profileSql.replace(/\s+/gu, ' ').trim()).toBe(
        "INSERT INTO CLIENTS ( EMAIL, FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME, BIRTHDAY, PHONE_NUMBER, ID_ADDRESS, GENDER, ACCEPTED_TERMS_AT, LANGUAGE ) VALUES ( :email, :firstName, :secondName, :firstSurname, :secondSurname, TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :addressId, :gender, CASE WHEN :terms = 1 THEN SYSTIMESTAMP END, :language ) RETURNING CLIENT_ID INTO :clientId",
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        2,
        profileSql,
        {
          email: { val: data.email, type: oracle.STRING },
          firstName: { val: data.firstName, type: oracle.STRING },
          secondName: { val: data.secondName, type: oracle.STRING },
          firstSurname: { val: data.firstSurname, type: oracle.STRING },
          secondSurname: { val: data.secondSurname, type: oracle.STRING },
          birthday: { val: data.birthday, type: oracle.STRING },
          phoneNumber: { val: data.phoneNumber, type: oracle.STRING },
          addressId: { val: 7, type: oracle.NUMBER },
          gender: { val: null, type: oracle.STRING },
          terms: { val: 0, type: oracle.NUMBER },
          language: { val: data.language, type: oracle.STRING },
          clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
        },
        { autoCommit: false },
      );

      const credentialsSql: string = connection.execute.mock.calls[2][0];
      expect(credentialsSql.replace(/\s+/gu, ' ').trim()).toBe(
        'INSERT INTO CLIENT_LOCAL_CREDENTIALS ( CLIENT_ID, PASSWORD_HASH, SALT ) VALUES (:clientId, :passwordHash, :salt)',
      );
      expect(connection.execute).toHaveBeenNthCalledWith(
        3,
        credentialsSql,
        {
          clientId: { val: 42, type: oracle.NUMBER },
          passwordHash: { val: data.passwordHash, type: oracle.STRING },
          salt: { val: data.salt, type: oracle.STRING },
        },
        { autoCommit: false },
      );
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalledTimes(1);
      expect(connection.execute.mock.invocationCallOrder[2]).toBeLessThan(
        connection.commit.mock.invocationCallOrder[0],
      );
      expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        connection.close.mock.invocationCallOrder[0],
      );
    });

    it.each([undefined, null])(
      'binds absent optional values as typed NULLs (%p) and omits language for the database default',
      async (value) => {
        await expect(
          repository.createClient({
            ...client,
            secondName: value,
            firstSurname: value,
            secondSurname: value,
            birthday: value,
            phoneNumber: value,
            address: value,
          }),
        ).resolves.toBe(42);

        const [sql, binds] = connection.execute.mock.calls[0] as [
          string,
          Record<string, oracle.BindParameter>,
        ];
        for (const field of [
          'secondName',
          'firstSurname',
          'secondSurname',
          'birthday',
          'phoneNumber',
        ]) {
          expect(binds[field]).toEqual({ val: null, type: oracle.STRING });
        }
        expect(binds.addressId).toEqual({ val: null, type: oracle.NUMBER });
        expect(connection.execute).toHaveBeenCalledTimes(2);
        expect(sql).toContain('INSERT INTO CLIENTS');
        expect(binds).not.toHaveProperty('language');
        expect(sql).not.toMatch(/\bLANGUAGE\b|:language/u);
        expect(sql).toContain("TO_DATE(:birthday, 'FXYYYY-MM-DD')");
      },
    );

    it('keeps user data and credentials out of the SQL text', async () => {
      const data = {
        ...client,
        firstName: "Ana'); DROP TABLE CLIENTS; --",
      };
      await repository.createClient(data);

      for (const [sql] of connection.execute.mock.calls) {
        expect(sql).not.toContain(data.firstName);
        expect(sql).not.toContain(data.email);
        expect(sql).not.toContain(data.passwordHash);
        expect(sql).not.toContain(data.salt);
      }
      expect(connection.execute.mock.calls[0][1].firstName.val).toBe(
        data.firstName,
      );
    });

    it.each([
      {},
      { rowsAffected: 0, outBinds: { clientId: [42] } },
      { rowsAffected: 2, outBinds: { clientId: [42] } },
      { rowsAffected: 1 },
      { rowsAffected: 1, outBinds: {} },
      { rowsAffected: 1, outBinds: { clientId: 42 } },
      { rowsAffected: 1, outBinds: { clientId: [] } },
      { rowsAffected: 1, outBinds: { clientId: [1, 2] } },
    ])('rolls back unexpected profile results: %p', async (result) => {
      connection.execute.mockReset().mockResolvedValueOnce(result);

      await expect(repository.createClient(client)).rejects.toThrow(
        'Oracle did not return a single created client.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it.each([
      undefined,
      null,
      '42',
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])('rolls back an invalid generated identifier: %p', async (clientId) => {
      connection.execute.mockReset().mockResolvedValueOnce({
        rowsAffected: 1,
        outBinds: { clientId: [clientId] },
      });

      await expect(repository.createClient(client)).rejects.toThrow(
        'Oracle returned an invalid client identifier.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('preserves a generated identifier at the safe integer boundary', async () => {
      connection.execute
        .mockReset()
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { clientId: [Number.MAX_SAFE_INTEGER] },
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });

      await expect(repository.createClient(client)).resolves.toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(connection.execute.mock.calls[1][1].clientId.val).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });

    it.each([undefined, 0, 2])(
      'rolls back if the credentials insert affects an unexpected number of rows: %p',
      async (rowsAffected) => {
        connection.execute
          .mockReset()
          .mockResolvedValueOnce(insertedClient)
          .mockResolvedValueOnce({ rowsAffected });

        await expect(repository.createClient(client)).rejects.toThrow(
          'Oracle did not create a single credentials record.',
        );
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['profile', 'credentials', 'commit'])(
      'propagates a %s failure and rolls back before releasing the connection',
      async (step) => {
        const error = new Error('Oracle operation failed');
        if (step === 'profile') {
          connection.execute.mockReset().mockRejectedValue(error);
        } else if (step === 'credentials') {
          connection.execute
            .mockReset()
            .mockResolvedValueOnce(insertedClient)
            .mockRejectedValueOnce(error);
        } else {
          connection.commit.mockRejectedValue(error);
        }

        await expect(repository.createClient(client)).rejects.toBe(error);
        expect(connection.execute).toHaveBeenCalledTimes(
          step === 'profile' ? 1 : 2,
        );
        expect(connection.commit).toHaveBeenCalledTimes(
          step === 'commit' ? 1 : 0,
        );
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(connection.rollback.mock.invocationCallOrder[0]).toBeLessThan(
          connection.close.mock.invocationCallOrder[0],
        );
      },
    );

    it.each([
      [true, false],
      [false, true],
      [true, true],
    ])(
      'preserves the original error when rollback fails=%p and close fails=%p',
      async (rollbackFails, closeFails) => {
        const error = new Error('Original insert failure');
        connection.execute.mockReset().mockRejectedValue(error);
        if (rollbackFails) {
          connection.rollback.mockRejectedValue(new Error('Rollback failed'));
        }
        if (closeFails) {
          connection.close.mockRejectedValue(new Error('Close failed'));
        }

        await expect(repository.createClient(client)).rejects.toBe(error);
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it('propagates an acquisition error without attempting cleanup', async () => {
      const error = new Error('Pool unavailable');
      pool.getConnection.mockRejectedValue(error);

      await expect(repository.createClient(client)).rejects.toBe(error);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('propagates a close failure after commit without attempting rollback', async () => {
      const error = new Error('Connection release failed');
      connection.close.mockRejectedValue(error);

      await expect(repository.createClient(client)).rejects.toBe(error);
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('foreign key failures', () => {
    it.each(['FK_ADDRESSES_DISTRICT', 'FK_CLIENT_ADDRESS'])(
      'rolls back client creation when Oracle rejects %s',
      async (constraint) => {
        const error = Object.assign(
          new Error('Parent key not found: ' + constraint),
          { errorNum: 2291 },
        );
        if (constraint !== 'FK_ADDRESSES_DISTRICT')
          connection.execute.mockResolvedValueOnce(insertedAddress);
        connection.execute.mockRejectedValueOnce(error);
        const data = {
          email: 'persona@example.com',
          firstName: 'Ana',
          firstSurname: 'Núñez',
          secondSurname: 'Solano',
          birthday: '2000-02-29',
          phoneNumber: '88888888',
          address: { districtId: 999 },
          passwordHash: 'test-password-hash',
          salt: 'test-salt',
        };
        const creation = repository.createClient(data);

        await expect(creation).rejects.toBe(error);
        expect(connection.execute).toHaveBeenCalledTimes(
          constraint === 'FK_ADDRESSES_DISTRICT' ? 1 : 2,
        );
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('new address transaction', () => {
    const profile = {
      email: 'persona@example.com',
      firstName: 'Ana',
      firstSurname: 'Núñez',
      secondSurname: 'Solano',
      birthday: '2000-02-29',
      phoneNumber: '88888888',
      passwordHash: 'test-hash',
      salt: 'test-salt',
    };
    const address = {
      districtId: 71,
      details: "Casa'); DROP TABLE ADDRESSES; --",
    };
    const create = () => {
      const data = { ...profile, address };
      return repository.createClient(data);
    };
    const insertedProfile = () => ({
      rowsAffected: 1,
      outBinds: { clientId: [42] },
    });

    it('binds a new address and uses its generated ID for the client on one connection', async () => {
      connection.execute
        .mockResolvedValueOnce(insertedAddress)
        .mockResolvedValueOnce(insertedProfile())
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await expect(create()).resolves.toBe(42);
      expect(pool.getConnection).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledTimes(3);
      const [sql, binds, options] = connection.execute.mock.calls[0] as [
        string,
        Record<string, oracle.BindParameter>,
        oracle.ExecuteOptions,
      ];
      expect(sql.replace(/\s+/gu, ' ').trim()).toBe(
        'INSERT INTO ADDRESSES (ID_DISTRICT, DETAILS) VALUES (:districtId, :details) RETURNING ID_ADDRESS INTO :addressId',
      );
      expect(sql).not.toContain(address.details);
      expect(binds).toEqual({
        districtId: { val: 71, type: oracle.NUMBER },
        details: { val: address.details, type: oracle.STRING },
        addressId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      });
      expect(options).toEqual({ autoCommit: false });
      expect(connection.execute.mock.calls[1][1].addressId).toEqual({
        val: 7,
        type: oracle.NUMBER,
      });
      expect(connection.execute.mock.calls[2][1].clientId).toEqual({
        val: 42,
        type: oracle.NUMBER,
      });
      for (const call of connection.execute.mock.calls)
        expect(call[2]).toEqual({ autoCommit: false });
      expect(connection.execute.mock.invocationCallOrder[2]).toBeLessThan(
        connection.commit.mock.invocationCallOrder[0],
      );
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null, ''])(
      'binds optional address details %p',
      async (details) => {
        connection.execute
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedProfile())
          .mockResolvedValueOnce({ rowsAffected: 1 });
        await repository.createClient({
          ...profile,
          address: { districtId: 71, details },
        });
        expect(connection.execute.mock.calls[0][1].details).toEqual({
          val: details ?? null,
          type: oracle.STRING,
        });
      },
    );

    it('rolls back the complete client creation at every failed step', async () => {
      for (const step of ['address', 'profile', 'credentials', 'commit']) {
        jest.clearAllMocks();
        connection.execute.mockReset();
        const error = new Error('Insert or commit failed');
        if (step !== 'address')
          connection.execute.mockResolvedValueOnce(insertedAddress);
        if (step === 'credentials' || step === 'commit')
          connection.execute.mockResolvedValueOnce(insertedProfile());
        if (step === 'commit') {
          connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
          connection.commit.mockRejectedValueOnce(error);
        } else connection.execute.mockRejectedValueOnce(error);
        await expect(create()).rejects.toBe(error);
        expect(connection.execute).toHaveBeenCalledTimes(
          step === 'address' ? 1 : step === 'profile' ? 2 : 3,
        );
        expect(connection.commit).toHaveBeenCalledTimes(
          step === 'commit' ? 1 : 0,
        );
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(connection.rollback.mock.invocationCallOrder[0]).toBeLessThan(
          connection.close.mock.invocationCallOrder[0],
        );
      }
    });

    it.each([
      {},
      { rowsAffected: 0, outBinds: { addressId: [7] } },
      { rowsAffected: 2, outBinds: { addressId: [7] } },
      { rowsAffected: 1 },
      { rowsAffected: 1, outBinds: {} },
      { rowsAffected: 1, outBinds: { addressId: 7 } },
      { rowsAffected: 1, outBinds: { addressId: [] } },
      { rowsAffected: 1, outBinds: { addressId: [7, 8] } },
    ])(
      'stops before inserting a user on an unexpected address result %p',
      async (result) => {
        connection.execute.mockResolvedValueOnce(result);
        await expect(create()).rejects.toThrow(
          'Oracle did not return a single created address.',
        );
        expect(connection.execute).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      undefined,
      null,
      '7',
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])('rolls back an invalid generated address ID %p', async (addressId) => {
      connection.execute.mockResolvedValueOnce({
        rowsAffected: 1,
        outBinds: { addressId: [addressId] },
      });
      await expect(create()).rejects.toThrow(
        'Oracle returned an invalid address identifier.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('preserves a generated address ID at the safe integer boundary', async () => {
      connection.execute
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { addressId: [Number.MAX_SAFE_INTEGER] },
        })
        .mockResolvedValueOnce(insertedProfile())
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await create();
      expect(connection.execute.mock.calls[1][1].addressId.val).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });
  });

  describe('clientEmailExists', () => {
    it('returns true when the email belongs to a client and releases the connection', async () => {
      connection.execute.mockResolvedValue({ rows: [{ FOUND: 1 }] });

      await expect(
        repository.clientEmailExists('cliente@example.com'),
      ).resolves.toBe(true);

      expect(pool.getConnection).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('returns false when no client has the email and releases the connection', async () => {
      await expect(
        repository.clientEmailExists('nuevo@example.com'),
      ).resolves.toBe(false);

      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('returns false if Oracle provides no rows', async () => {
      connection.execute.mockResolvedValue({});

      await expect(
        repository.clientEmailExists('cliente@example.com'),
      ).resolves.toBe(false);

      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('binds the email as data without interpolating it into SQL', async () => {
      const email = "cliente@example.com' OR '1' = '1";

      await repository.clientEmailExists(email);

      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledWith(
        'SELECT 1 AS FOUND FROM CLIENTS WHERE EMAIL = :email AND ROWNUM = 1',
        { email },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: true },
      );
    });

    it('propagates query errors and still releases the connection', async () => {
      const error = new Error('Query failed');
      connection.execute.mockRejectedValue(error);

      await expect(
        repository.clientEmailExists('cliente@example.com'),
      ).rejects.toBe(error);

      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('propagates acquisition errors without trying to use a connection', async () => {
      const error = new Error('Pool unavailable');
      pool.getConnection.mockRejectedValue(error);

      await expect(
        repository.clientEmailExists('cliente@example.com'),
      ).rejects.toBe(error);

      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('propagates errors when releasing the connection', async () => {
      const error = new Error('Connection release failed');
      connection.close.mockRejectedValue(error);

      await expect(
        repository.clientEmailExists('cliente@example.com'),
      ).rejects.toBe(error);

      expect(connection.close).toHaveBeenCalledTimes(1);
    });
  });
});
