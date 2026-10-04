jest.mock('oracledb', () => ({
  ...jest.requireActual('oracledb'),
  createPool: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from './enums/user-role.enum';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import { UsersRepository } from './users.repository';
import { ListEmployeesQueryDto } from './dto/list-users-query.dto';

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

  describe('listEmployees', () => {
    it('combines bound filters, escapes wildcards and returns a complete paginated profile', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ TOTAL: 21 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              ID: 42,
              NAME: 'Ana Núñez',
              EMAIL: 'ana@example.com',
              PHONE_NUMBER: '88888888',
              ROLE: UserRole.EMPLOYEE,
              BRANCH_ID: 3,
              BRANCH_NAME: 'Centro',
              CREATED_AT: null,
              HIRE_DATE: '2026-10-01',
              PASSWORD_HASH: 'private',
            },
          ],
        });
      const query = Object.assign(new ListEmployeesQueryDto(), {
        search: 'Núñez%_\\',
        role: [UserRole.EMPLOYEE, UserRole.ADMINISTRATOR],
        branchId: [3, 5],
        page: 99,
        sortBy: 'hireDate',
        sortDirection: 'desc',
      });
      const result = await repository.listEmployees(query);
      expect(result).toMatchObject({
        total: 21,
        page: 3,
        totalPages: 3,
        pageSize: 10,
      });
      expect(result.items[0]).toEqual({
        id: 42,
        name: 'Ana Núñez',
        email: 'ana@example.com',
        phoneNumber: '88888888',
        role: UserRole.EMPLOYEE,
        branchId: 3,
        branchName: 'Centro',
        createdAt: null,
        hireDate: '2026-10-01',
      });
      const [sql, binds] = connection.execute.mock.calls[1] as [
        string,
        Record<string, oracle.BindParameter>,
      ];
      expect(sql).toContain(
        'ORDER BY e.HIRE_DATE DESC NULLS LAST, e.EMPLOYEE_ID ASC',
      );
      expect(sql).toContain(
        'e.ROLE IN (:role0, :role1) AND e.BRANCH_ID IN (:branchId0, :branchId1)',
      );
      expect(sql).not.toContain(query.search);
      expect(binds.search.val).toBe('%núñez\\%\\_\\\\%');
      expect(binds.offset.val).toBe(20);
      expect(binds.role0.val).toBe(UserRole.EMPLOYEE);
      expect(binds.role1.val).toBe(UserRole.ADMINISTRATOR);
      expect(binds.branchId0.val).toBe(3);
      expect(binds.branchId1.val).toBe(5);
      expect(connection.execute.mock.calls[0][0]).toContain(
        'e.ROLE IN (:role0, :role1) AND e.BRANCH_ID IN (:branchId0, :branchId1)',
      );
      expect(connection.execute.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          role0: binds.role0,
          role1: binds.role1,
          branchId0: binds.branchId0,
          branchId1: binds.branchId1,
        }),
      );
    });
    it('returns zero results without a page query', async () => {
      connection.execute.mockResolvedValue({ rows: [{ TOTAL: 0 }] });
      expect(
        await repository.listEmployees(new ListEmployeesQueryDto()),
      ).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });
    it.each(['id', 'name', 'email', 'createdAt', 'role', 'branch'])(
      'supports safe ordering by %s and unknown historical dates',
      async (sortBy) => {
        connection.execute
          .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
          .mockResolvedValueOnce({ rows: [] });
        const result = await repository.listEmployees(
          Object.assign(new ListEmployeesQueryDto(), { sortBy }),
        );
        expect(result.total).toBe(1);
        expect(connection.execute.mock.calls[1][0]).toContain(
          'NULLS LAST, e.EMPLOYEE_ID ASC',
        );
      },
    );
    it('propagates a database failure and closes the connection', async () => {
      connection.execute.mockRejectedValue(new Error('Query unavailable'));
      await expect(
        repository.listEmployees(new ListEmployeesQueryDto()),
      ).rejects.toThrow('Query unavailable');
      expect(connection.close).toHaveBeenCalledTimes(1);
    });
    it('returns real branch options independently of creation catalogs', async () => {
      connection.execute.mockResolvedValue({
        rows: [{ BRANCH_ID: 3, NAME: 'Centro' }],
      });
      expect(await repository.getEmployeeListOptions()).toEqual({
        branches: [{ id: 3, label: 'Centro' }],
      });
      connection.execute.mockResolvedValue({});
      expect(await repository.getEmployeeListOptions()).toEqual({
        branches: [],
      });
    });
  });

  describe('findEmployeeWithLocalCredentialsByEmail', () => {
    const row = {
      EMPLOYEE_ID: 21,
      ROLE: UserRole.ADMINISTRATOR,
      EMAIL: 'Personal@Example.com',
      FIRST_NAME: 'Ana',
      SECOND_NAME: null,
      FIRST_SURNAME: 'Solano',
      SECOND_SURNAME: 'Rojas',
      CREDENTIALS_EMPLOYEE_ID: 21,
      PASSWORD_HASH: 'test-password-hash',
    };

    it.each([UserRole.ADMINISTRATOR, UserRole.EMPLOYEE])(
      'reads credentials and profile for %s using a normalized bound email',
      async (role) => {
        connection.execute.mockResolvedValue({
          rows: [{ ...row, ROLE: role }],
        });
        await expect(
          repository.findEmployeeWithLocalCredentialsByEmail(
            '  Personal@Example.com  ',
          ),
        ).resolves.toEqual({
          id: 21,
          role,
          email: 'Personal@Example.com',
          firstName: 'Ana',
          secondName: null,
          firstSurname: 'Solano',
          secondSurname: 'Rojas',
          passwordHash: 'test-password-hash',
        });
        expect(connection.execute).toHaveBeenCalledTimes(1);
        const [sql, binds, options] = connection.execute.mock.calls[0];
        expect(sql).toContain(
          'LEFT JOIN EMPLOYEE_LOCAL_CREDENTIALS c ON c.EMPLOYEE_ID = e.EMPLOYEE_ID',
        );
        expect(sql).toContain('WHERE LOWER(TRIM(e.EMAIL)) = :email');
        expect(sql).toContain('FETCH FIRST 2 ROWS ONLY');
        expect(sql).not.toContain('SALT');
        expect(binds).toEqual({
          email: { val: 'personal@example.com', type: oracle.STRING },
        });
        expect(options).toEqual({
          outFormat: oracle.OUT_FORMAT_OBJECT,
          autoCommit: true,
        });
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
      },
    );

    it('preserves the optional second name when it exists', async () => {
      connection.execute.mockResolvedValue({
        rows: [{ ...row, SECOND_NAME: 'María' }],
      });
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).resolves.toHaveProperty('secondName', 'María');
    });

    it.each([{ rows: [] }, {}])(
      'returns null for an absent employee: %p',
      async (result) => {
        connection.execute.mockResolvedValue(result);
        await expect(
          repository.findEmployeeWithLocalCredentialsByEmail(
            'missing@example.com',
          ),
        ).resolves.toBeNull();
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it('returns null when the employee has no local credentials', async () => {
      connection.execute.mockResolvedValue({
        rows: [{ ...row, CREDENTIALS_EMPLOYEE_ID: null, PASSWORD_HASH: null }],
      });
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).resolves.toBeNull();
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it.each([true, false])(
      'rejects an ambiguous email even when a duplicate has credentials=%s',
      async (hasCredentials) => {
        const duplicate = {
          ...row,
          EMPLOYEE_ID: 22,
          EMAIL: ' personal@example.com ',
          CREDENTIALS_EMPLOYEE_ID: hasCredentials ? 22 : null,
          PASSWORD_HASH: hasCredentials ? 'another-test-hash' : null,
        };
        connection.execute.mockResolvedValue({ rows: [row, duplicate] });
        await expect(
          repository.findEmployeeWithLocalCredentialsByEmail(
            'personal@example.com',
          ),
        ).rejects.toThrow('Employee email lookup returned multiple accounts.');
        expect(connection.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      { EMPLOYEE_ID: 0 },
      { EMPLOYEE_ID: 1.5 },
      { EMPLOYEE_ID: '21' },
      { EMPLOYEE_ID: Number.MAX_SAFE_INTEGER + 1 },
      { ROLE: UserRole.CLIENT },
      { ROLE: 'UNKNOWN' },
    ])('rejects an invalid employee identity: %p', async (invalid) => {
      connection.execute.mockResolvedValue({ rows: [{ ...row, ...invalid }] });
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).rejects.toThrow('Oracle returned an invalid employee identity.');
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it.each([
      { CREDENTIALS_EMPLOYEE_ID: 22 },
      { PASSWORD_HASH: null },
      { PASSWORD_HASH: 123 },
      { PASSWORD_HASH: '' },
      { PASSWORD_HASH: '   ' },
    ])('rejects an invalid credentials record: %p', async (invalid) => {
      connection.execute.mockResolvedValue({ rows: [{ ...row, ...invalid }] });
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).rejects.toThrow('Oracle returned invalid employee credentials.');
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('keeps SQL injection input in a bind variable', async () => {
      const email = "' OR 1=1 --";
      await repository.findEmployeeWithLocalCredentialsByEmail(email);
      const [sql, binds] = connection.execute.mock.calls[0];
      expect(sql).not.toContain(email);
      expect(binds).toEqual({
        email: { val: email.toLowerCase(), type: oracle.STRING },
      });
    });

    it('releases the connection and propagates a query failure', async () => {
      const failure = new Error('Query failed');
      connection.execute.mockRejectedValueOnce(failure);
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).rejects.toBe(failure);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('propagates acquisition failures without executing SQL', async () => {
      const failure = new Error('Connection unavailable');
      pool.getConnection.mockRejectedValueOnce(failure);
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).rejects.toBe(failure);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.close).not.toHaveBeenCalled();
    });

    it('does not return credentials if releasing the connection fails', async () => {
      const failure = new Error('Connection close failed');
      connection.execute.mockResolvedValue({ rows: [row] });
      connection.close.mockRejectedValueOnce(failure);
      await expect(
        repository.findEmployeeWithLocalCredentialsByEmail(
          'personal@example.com',
        ),
      ).rejects.toBe(failure);
    });
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
          rows: [{ EMPLOYEE_ID: 21, ROLE: role, FIRST_NAME: 'Ana' }],
        });
        await expect(repository.findEmployeeIdentityById(21)).resolves.toEqual({
          id: 21,
          role,
          firstName: 'Ana',
        });
        expect(connection.execute).toHaveBeenCalledTimes(1);
        expect(connection.execute).toHaveBeenCalledWith(
          'SELECT EMPLOYEE_ID, ROLE, FIRST_NAME FROM EMPLOYEES WHERE EMPLOYEE_ID = :employeeId',
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
          { EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
          { EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
        ],
      },
      {
        rows: [
          {
            EMPLOYEE_ID: '21',
            ROLE: UserRole.ADMINISTRATOR,
            FIRST_NAME: 'Ana',
          },
        ],
      },
      {
        rows: [
          { EMPLOYEE_ID: 1.5, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
        ],
      },
      {
        rows: [
          { EMPLOYEE_ID: 0, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
        ],
      },
      {
        rows: [
          { EMPLOYEE_ID: 42, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
        ],
      },
      { rows: [{ EMPLOYEE_ID: 21, ROLE: UserRole.CLIENT, FIRST_NAME: 'Ana' }] },
      { rows: [{ EMPLOYEE_ID: 21, ROLE: 'UNKNOWN', FIRST_NAME: 'Ana' }] },
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

    it.each([undefined, null, 42, '', '   '])(
      'rejects an invalid first name %p',
      async (firstName) => {
        connection.execute.mockResolvedValue({
          rows: [
            { EMPLOYEE_ID: 21, ROLE: UserRole.EMPLOYEE, FIRST_NAME: firstName },
          ],
        });
        await expect(
          repository.findEmployeeIdentityById(21),
        ).resolves.toBeNull();
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
        rows: [
          { EMPLOYEE_ID: 21, ROLE: UserRole.ADMINISTRATOR, FIRST_NAME: 'Ana' },
        ],
      });
      connection.close.mockRejectedValue(error);
      await expect(repository.findEmployeeIdentityById(21)).rejects.toBe(error);
    });
  });

  const insertedAddress = { rowsAffected: 1, outBinds: { addressId: [7] } };

  describe('createEmployee', () => {
    const employee: CreateEmployeeRecord = {
      role: UserRole.EMPLOYEE,
      email: 'empleado@example.com',
      firstName: 'Ana',
      firstSurname: 'Núñez',
      secondSurname: 'Solano',
      hireDate: '2026-10-01',
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
          "INSERT INTO EMPLOYEES ( FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME, BIRTHDAY, PHONE_NUMBER, EMAIL, ROLE, ID_ADDRESS, BRANCH_ID, HIRE_DATE ) VALUES ( :firstName, :secondName, :firstSurname, :secondSurname, TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :email, :role, :addressId, :branchId, TO_DATE(:hireDate, 'FXYYYY-MM-DD') ) RETURNING EMPLOYEE_ID INTO :employeeId",
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
            hireDate: { val: data.hireDate, type: oracle.STRING },
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
          hireDate: '2026-10-01',
          birthday: '2000-02-29',
          phoneNumber: '88888888',
          address: { districtId: 999 },
          branchId: 999,
          passwordHash: 'test-password-hash',
          salt: 'test-salt',
        };
        const creation = repository.createEmployee({
          ...data,
          role:
            role === 'EMPLOYEE' ? UserRole.EMPLOYEE : UserRole.ADMINISTRATOR,
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
      hireDate: '2026-10-01',
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
    const roles = [UserRole.EMPLOYEE, UserRole.ADMINISTRATOR] as const;
    const create = (role: (typeof roles)[number]) => {
      const data = { ...profile, address };
      return repository.createEmployee({ ...data, role });
    };
    const insertedProfile = () => ({
      rowsAffected: 1,
      outBinds: { employeeId: [42] },
    });

    it.each(roles)(
      'binds a new address and uses its generated ID for %s on one connection',
      async (role) => {
        connection.execute
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedProfile())
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
        expect(connection.execute.mock.calls[2][1]['employeeId']).toEqual({
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
      },
    );

    it.each([undefined, null, ''])(
      'binds optional address details %p',
      async (details) => {
        connection.execute
          .mockResolvedValueOnce(insertedAddress)
          .mockResolvedValueOnce(insertedProfile())
          .mockResolvedValueOnce({ rowsAffected: 1 });
        await repository.createEmployee({
          ...profile,
          role: UserRole.EMPLOYEE,
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
            connection.execute.mockResolvedValueOnce(insertedProfile());
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
        await expect(create(UserRole.EMPLOYEE)).rejects.toThrow(
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
        .mockResolvedValueOnce(insertedProfile())
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await create(UserRole.EMPLOYEE);
      expect(connection.execute.mock.calls[1][1].addressId.val).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });
  });
});
