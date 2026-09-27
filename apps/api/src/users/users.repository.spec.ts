jest.mock('oracledb', () => ({
  ...jest.requireActual('oracledb'),
  createPool: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from './enums/user-role.enum';
import type { CreateClientRecord } from './types/create-client-record.type';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  let module: TestingModule;
  let repository: UsersRepository;
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
        UsersRepository,
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
    repository = module.get(UsersRepository);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('getCreationOptions', () => {
    const queries = [
      'SELECT ID_PROVINCE, NAME FROM PROVINCES ORDER BY NAME, ID_PROVINCE',
      'SELECT ID_CANTON, NAME, ID_PROVINCE FROM CANTONS ORDER BY NAME, ID_CANTON',
      'SELECT ID_DISTRICT, NAME, ID_CANTON FROM DISTRICTS ORDER BY NAME, ID_DISTRICT',
      'SELECT BRANCH_ID, NAME FROM CINEMAS ORDER BY NAME, BRANCH_ID',
    ];

    it('returns labels and geographic parent IDs using only catalog columns', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ ID_PROVINCE: 1, NAME: 'San José' }] })
        .mockResolvedValueOnce({
          rows: [{ ID_CANTON: 19, NAME: 'Curridabat', ID_PROVINCE: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ ID_DISTRICT: 102, NAME: 'Curridabat', ID_CANTON: 19 }],
        })
        .mockResolvedValueOnce({
          rows: [{ BRANCH_ID: 1, NAME: 'Cinépolis Multiplaza del Este' }],
        });
      await expect(repository.getCreationOptions()).resolves.toEqual({
        provinces: [{ id: 1, label: 'San José' }],
        cantons: [{ id: 19, label: 'Curridabat', provinceId: 1 }],
        districts: [{ id: 102, label: 'Curridabat', cantonId: 19 }],
        branches: [{ id: 1, label: 'Cinépolis Multiplaza del Este' }],
      });
      expect(pool.getConnection).toHaveBeenCalledTimes(4);
      expect(connection.execute).toHaveBeenCalledTimes(4);
      queries.forEach((sql, index) => {
        expect(connection.execute).toHaveBeenNthCalledWith(
          index + 1,
          sql,
          {},
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: true },
        );
      });
      expect(connection.close).toHaveBeenCalledTimes(4);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).not.toHaveBeenCalled();
    });

    it.each([{ rows: [] }, {}])(
      'returns empty arrays for empty query results %p',
      async (result) => {
        connection.execute.mockResolvedValue(result);
        await expect(repository.getCreationOptions()).resolves.toEqual({
          provinces: [],
          cantons: [],
          districts: [],
          branches: [],
        });
        expect(connection.close).toHaveBeenCalledTimes(4);
      },
    );

    it('preserves the remaining catalogs when one table is empty', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ ID_PROVINCE: 1, NAME: 'San José' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ BRANCH_ID: 1, NAME: 'Sucursal existente' }],
        });
      await expect(repository.getCreationOptions()).resolves.toEqual({
        provinces: [{ id: 1, label: 'San José' }],
        cantons: [],
        districts: [],
        branches: [{ id: 1, label: 'Sucursal existente' }],
      });
    });

    it.each([0, 1, 2, 3])(
      'rejects the entire result and releases the connection when query %i fails',
      async (index) => {
        const error = new Error('Query failed');
        for (let successful = 0; successful < index; successful++) {
          connection.execute.mockResolvedValueOnce({ rows: [] });
        }
        connection.execute.mockRejectedValueOnce(error);
        await expect(repository.getCreationOptions()).rejects.toBe(error);
        expect(connection.execute).toHaveBeenCalledTimes(index + 1);
        expect(connection.close).toHaveBeenCalledTimes(index + 1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
      },
    );

    it('propagates connection acquisition failures without running queries', async () => {
      const error = new Error('Connection unavailable');
      pool.getConnection.mockRejectedValue(error);
      await expect(repository.getCreationOptions()).rejects.toBe(error);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('propagates connection release failures', async () => {
      const error = new Error('Connection close failed');
      connection.close.mockRejectedValue(error);
      await expect(repository.getCreationOptions()).rejects.toBe(error);
    });
  });

  describe('findEmployeeIdentityById', () => {
    it.each([UserRole.ADMINISTRATOR, UserRole.EMPLOYEE])(
      'reads a minimal employee identity with role %s using a bound ID',
      async (role) => {
        connection.execute.mockResolvedValue({
          rows: [{ EMPLOYEE_ID: 21, ROLE: role }],
        });
        await expect(repository.findEmployeeIdentityById(21)).resolves.toEqual({
          id: 21,
          role,
        });
        expect(connection.execute).toHaveBeenCalledTimes(1);
        expect(connection.execute).toHaveBeenCalledWith(
          'SELECT EMPLOYEE_ID, ROLE FROM EMPLOYEES WHERE EMPLOYEE_ID = :employeeId',
          { employeeId: { val: 21, type: oracle.NUMBER } },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: true },
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
      },
    );

    it.each([
      {},
      { rows: [] },
      {
        rows: [
          { EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR },
          { EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR },
        ],
      },
      { rows: [{ EMPLOYEE_ID: '21', ROLE: UserRole.ADMINISTRATOR }] },
      { rows: [{ EMPLOYEE_ID: 1.5, ROLE: UserRole.ADMINISTRATOR }] },
      { rows: [{ EMPLOYEE_ID: 0, ROLE: UserRole.ADMINISTRATOR }] },
      { rows: [{ EMPLOYEE_ID: 42, ROLE: UserRole.ADMINISTRATOR }] },
      { rows: [{ EMPLOYEE_ID: 21, ROLE: UserRole.CLIENT }] },
      { rows: [{ EMPLOYEE_ID: 21, ROLE: 'UNKNOWN' }] },
    ])(
      'returns no identity for an absent or invalid result %p',
      async (result) => {
        connection.execute.mockResolvedValue(result);
        await expect(
          repository.findEmployeeIdentityById(21),
        ).resolves.toBeNull();
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it('releases the connection when the query fails', async () => {
      const error = new Error('Query failed');
      connection.execute.mockRejectedValue(error);
      await expect(repository.findEmployeeIdentityById(21)).rejects.toBe(error);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('propagates connection acquisition failures', async () => {
      const error = new Error('Connection unavailable');
      pool.getConnection.mockRejectedValue(error);
      await expect(repository.findEmployeeIdentityById(21)).rejects.toBe(error);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('does not return an identity when releasing the connection fails', async () => {
      const error = new Error('Connection close failed');
      connection.execute.mockResolvedValue({
        rows: [{ EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR }],
      });
      connection.close.mockRejectedValue(error);
      await expect(repository.findEmployeeIdentityById(21)).rejects.toBe(error);
    });
  });

  const insertedAddress = { rowsAffected: 1, outBinds: { addressId: [7] } };

  describe('createClient', () => {
    const client: CreateClientRecord = {
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
      const data: CreateClientRecord = {
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
        "INSERT INTO CLIENTS ( EMAIL, FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME, BIRTHDAY, PHONE_NUMBER, ID_ADDRESS, LANGUAGE ) VALUES ( :email, :firstName, :secondName, :firstSurname, :secondSurname, TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :addressId, :language ) RETURNING CLIENT_ID INTO :clientId",
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

  describe('createEmployee', () => {
    const employee: CreateEmployeeRecord = {
      role: UserRole.EMPLOYEE,
      email: 'empleado@example.com',
      firstName: 'Ana',
      firstSurname: 'Núñez',
      secondSurname: 'Solano',
      birthday: '2000-02-29',
      phoneNumber: '+506 8888-8888',
      address: { districtId: 71, details: 'Casa azul' },
      branchId: 3,
      passwordHash: 'test-password-hash',
      salt: 'test-salt',
    };
    const insertedEmployee = {
      rowsAffected: 1,
      outBinds: { employeeId: [84] },
    };

    beforeEach(() => {
      connection.execute
        .mockResolvedValueOnce(insertedAddress)
        .mockResolvedValueOnce(insertedEmployee)
        .mockResolvedValueOnce({ rowsAffected: 1 });
    });

    it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR] as const)(
      'inserts a %s and its credentials on the same connection before committing',
      async (role) => {
        const data = { ...employee, role, secondName: 'María' };

        await expect(repository.createEmployee(data)).resolves.toBe(84);

        expect(pool.getConnection).toHaveBeenCalledTimes(1);
        expect(connection.execute).toHaveBeenCalledTimes(3);
        const profileSql: string = connection.execute.mock.calls[1][0];
        expect(profileSql.replace(/\s+/gu, ' ').trim()).toBe(
          "INSERT INTO EMPLOYEES ( FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME, BIRTHDAY, PHONE_NUMBER, EMAIL, ROLE, ID_ADDRESS, BRANCH_ID ) VALUES ( :firstName, :secondName, :firstSurname, :secondSurname, TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :email, :role, :addressId, :branchId ) RETURNING EMPLOYEE_ID INTO :employeeId",
        );
        expect(connection.execute).toHaveBeenNthCalledWith(
          2,
          profileSql,
          {
            firstName: { val: data.firstName, type: oracle.STRING },
            secondName: { val: data.secondName, type: oracle.STRING },
            firstSurname: { val: data.firstSurname, type: oracle.STRING },
            secondSurname: { val: data.secondSurname, type: oracle.STRING },
            birthday: { val: data.birthday, type: oracle.STRING },
            phoneNumber: { val: data.phoneNumber, type: oracle.STRING },
            email: { val: data.email, type: oracle.STRING },
            role: { val: role, type: oracle.STRING },
            addressId: { val: 7, type: oracle.NUMBER },
            branchId: { val: data.branchId, type: oracle.NUMBER },
            employeeId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
          },
          { autoCommit: false },
        );
        const credentialsSql: string = connection.execute.mock.calls[2][0];
        expect(credentialsSql.replace(/\s+/gu, ' ').trim()).toBe(
          'INSERT INTO EMPLOYEE_LOCAL_CREDENTIALS ( EMPLOYEE_ID, PASSWORD_HASH, SALT ) VALUES (:employeeId, :passwordHash, :salt)',
        );
        expect(connection.execute).toHaveBeenNthCalledWith(
          3,
          credentialsSql,
          {
            employeeId: { val: 84, type: oracle.NUMBER },
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
      },
    );

    it.each([undefined, null])(
      'binds an absent second name as a typed NULL: %p',
      async (secondName) => {
        await expect(
          repository.createEmployee({ ...employee, secondName }),
        ).resolves.toBe(84);
        expect(connection.execute.mock.calls[1][1].secondName).toEqual({
          val: null,
          type: oracle.STRING,
        });
      },
    );

    it('keeps employee data and credentials out of SQL text', async () => {
      const data = {
        ...employee,
        firstName: "Ana'); DROP TABLE EMPLOYEES; --",
      };
      await repository.createEmployee(data);
      for (const [sql] of connection.execute.mock.calls) {
        expect(sql).not.toContain(data.firstName);
        expect(sql).not.toContain(data.email);
        expect(sql).not.toContain(data.passwordHash);
        expect(sql).not.toContain(data.salt);
      }
      expect(connection.execute.mock.calls[1][1].firstName.val).toBe(
        data.firstName,
      );
    });

    it.each([
      {},
      { rowsAffected: 0, outBinds: { employeeId: [84] } },
      { rowsAffected: 2, outBinds: { employeeId: [84] } },
      { rowsAffected: 1 },
      { rowsAffected: 1, outBinds: {} },
      { rowsAffected: 1, outBinds: { employeeId: 84 } },
      { rowsAffected: 1, outBinds: { employeeId: [] } },
      { rowsAffected: 1, outBinds: { employeeId: [1, 2] } },
    ])('rolls back unexpected employee insert results: %p', async (result) => {
      connection.execute
        .mockReset()
        .mockResolvedValueOnce(insertedAddress)
        .mockResolvedValueOnce(result);

      await expect(repository.createEmployee(employee)).rejects.toThrow(
        'Oracle did not return a single created employee.',
      );
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it.each([
      undefined,
      null,
      '84',
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      'rolls back an invalid generated employee identifier: %p',
      async (employeeId) => {
        connection.execute
          .mockReset()
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce({
            rowsAffected: 1,
            outBinds: { employeeId: [employeeId] },
          });

        await expect(repository.createEmployee(employee)).rejects.toThrow(
          'Oracle returned an invalid employee identifier.',
        );
        expect(connection.execute).toHaveBeenCalledTimes(2);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it('preserves a generated employee identifier at the safe integer boundary', async () => {
      connection.execute
        .mockReset()
        .mockResolvedValueOnce(insertedAddress)
        .mockResolvedValueOnce({
          rowsAffected: 1,
          outBinds: { employeeId: [Number.MAX_SAFE_INTEGER] },
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await expect(repository.createEmployee(employee)).resolves.toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(connection.execute.mock.calls[2][1].employeeId.val).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });

    it.each([undefined, 0, 2])(
      'rolls back unexpected credentials row counts: %p',
      async (rowsAffected) => {
        connection.execute
          .mockReset()
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedEmployee)
          .mockResolvedValueOnce({ rowsAffected });
        await expect(repository.createEmployee(employee)).rejects.toThrow(
          'Oracle did not create a single credentials record.',
        );
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['profile', 'credentials', 'commit'])(
      'propagates a %s failure and rolls back before closing',
      async (step) => {
        const error = new Error('Oracle operation failed');
        if (step === 'profile') {
          connection.execute
            .mockReset()
            .mockResolvedValueOnce(insertedAddress)
            .mockRejectedValueOnce(error);
        } else if (step === 'credentials') {
          connection.execute
            .mockReset()
            .mockResolvedValueOnce(insertedAddress)
            .mockResolvedValueOnce(insertedEmployee)
            .mockRejectedValueOnce(error);
        } else {
          connection.commit.mockRejectedValueOnce(error);
        }
        await expect(repository.createEmployee(employee)).rejects.toBe(error);
        expect(connection.execute).toHaveBeenCalledTimes(
          step === 'profile' ? 2 : 3,
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
      'preserves the operation error when rollback fails=%p and close fails=%p',
      async (rollbackFails, closeFails) => {
        const error = new Error('Original employee insert failure');
        connection.execute
          .mockReset()
          .mockResolvedValueOnce(insertedAddress)
          .mockRejectedValueOnce(error);
        if (rollbackFails) {
          connection.rollback.mockRejectedValueOnce(
            new Error('Rollback failed'),
          );
        }
        if (closeFails) {
          connection.close.mockRejectedValueOnce(new Error('Close failed'));
        }
        await expect(repository.createEmployee(employee)).rejects.toBe(error);
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it('propagates acquisition errors without using a connection', async () => {
      const error = new Error('Pool unavailable');
      pool.getConnection.mockRejectedValueOnce(error);
      await expect(repository.createEmployee(employee)).rejects.toBe(error);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('propagates a close error after commit without attempting rollback', async () => {
      const error = new Error('Connection release failed');
      connection.close.mockRejectedValueOnce(error);
      await expect(repository.createEmployee(employee)).rejects.toBe(error);
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('foreign key failures', () => {
    it.each([
      ['CLIENT', 'FK_ADDRESSES_DISTRICT'],
      ['CLIENT', 'FK_CLIENT_ADDRESS'],
      ['EMPLOYEE', 'FK_ADDRESSES_DISTRICT'],
      ['EMPLOYEE', 'FK_EMPLOYEES_ADDRESS'],
      ['EMPLOYEE', 'FK_EMPLOYEES_BRANCH'],
      ['ADMINISTRATOR', 'FK_ADDRESSES_DISTRICT'],
      ['ADMINISTRATOR', 'FK_EMPLOYEES_ADDRESS'],
      ['ADMINISTRATOR', 'FK_EMPLOYEES_BRANCH'],
    ])(
      'rolls back %s creation when Oracle rejects %s',
      async (role, constraint) => {
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
          branchId: 999,
          passwordHash: 'test-password-hash',
          salt: 'test-salt',
        };
        const creation =
          role === 'CLIENT'
            ? repository.createClient(data)
            : repository.createEmployee({
                ...data,
                role:
                  role === 'EMPLOYEE'
                    ? UserRole.EMPLOYEE
                    : UserRole.ADMINISTRATOR,
              });

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
      branchId: 3,
      passwordHash: 'test-hash',
      salt: 'test-salt',
    };
    const address = {
      districtId: 71,
      details: "Casa'); DROP TABLE ADDRESSES; --",
    };
    const roles = [
      UserRole.CLIENT,
      UserRole.EMPLOYEE,
      UserRole.ADMINISTRATOR,
    ] as const;
    const create = (role: (typeof roles)[number]) => {
      const data = { ...profile, address };
      return role === UserRole.CLIENT
        ? repository.createClient(data)
        : repository.createEmployee({ ...data, role });
    };
    const insertedProfile = (role: (typeof roles)[number]) => ({
      rowsAffected: 1,
      outBinds:
        role === UserRole.CLIENT ? { clientId: [42] } : { employeeId: [42] },
    });

    it.each(roles)(
      'binds a new address and uses its generated ID for %s on one connection',
      async (role) => {
        connection.execute
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedProfile(role))
          .mockResolvedValueOnce({ rowsAffected: 1 });
        await expect(create(role)).resolves.toBe(42);
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
        expect(
          connection.execute.mock.calls[2][1][
            role === UserRole.CLIENT ? 'clientId' : 'employeeId'
          ],
        ).toEqual({ val: 42, type: oracle.NUMBER });
        for (const call of connection.execute.mock.calls)
          expect(call[2]).toEqual({ autoCommit: false });
        expect(connection.execute.mock.invocationCallOrder[2]).toBeLessThan(
          connection.commit.mock.invocationCallOrder[0],
        );
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each([undefined, null, ''])(
      'binds optional address details %p',
      async (details) => {
        connection.execute
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedProfile(UserRole.CLIENT))
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

    it.each(roles)(
      'rolls back the complete %s creation at every failed step',
      async (role) => {
        for (const step of ['address', 'profile', 'credentials', 'commit']) {
          jest.clearAllMocks();
          connection.execute.mockReset();
          const error = new Error('Insert or commit failed');
          if (step !== 'address')
            connection.execute.mockResolvedValueOnce(insertedAddress);
          if (step === 'credentials' || step === 'commit')
            connection.execute.mockResolvedValueOnce(insertedProfile(role));
          if (step === 'commit') {
            connection.execute.mockResolvedValueOnce({ rowsAffected: 1 });
            connection.commit.mockRejectedValueOnce(error);
          } else connection.execute.mockRejectedValueOnce(error);
          await expect(create(role)).rejects.toBe(error);
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
      },
    );

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
        await expect(create(UserRole.CLIENT)).rejects.toThrow(
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
      await expect(create(UserRole.EMPLOYEE)).rejects.toThrow(
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
        .mockResolvedValueOnce(insertedProfile(UserRole.CLIENT))
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await create(UserRole.CLIENT);
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
