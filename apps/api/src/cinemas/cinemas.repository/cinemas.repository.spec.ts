import { Test, TestingModule } from '@nestjs/testing';
import oracle from 'oracledb';
import { DatabaseService } from '../../database/database.service';
import { CinemasRepository } from './cinemas.repository';

describe('CinemasRepository', () => {
  let repository: CinemasRepository;
  let databaseService: { query: jest.Mock; transaction: jest.Mock };
  const query = { page: 1, pageSize: 10 as const };
  const row = {
    ID: 1,
    NAME: 'Sucursal Heredia Centro',
    COMPANY_ID: 2,
    COMPANY_NAME: 'Cinetadel S.A',
  };

  function mockList(total: number, rows: unknown[] = []) {
    databaseService.query
      .mockResolvedValueOnce({ rows: [{ TOTAL: total }] })
      .mockResolvedValueOnce({ rows });
  }
  const call = (index: number) =>
    databaseService.query.mock.calls[index] as [
      string,
      Record<string, { val: unknown; type: number }>,
    ];

  beforeEach(async () => {
    databaseService = { query: jest.fn(), transaction: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CinemasRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();
    repository = module.get<CinemasRepository>(CinemasRepository);
  });

  describe('getAllCinemas', () => {
    it('returns cinemas mapped from database rows', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          { BRANCH_ID: 2, NAME: 'Mall San Pedro', COMPANY_ID: 1 },
          { BRANCH_ID: 5, NAME: 'Multiplaza Escazú', COMPANY_ID: 10 },
        ],
      });

      await expect(repository.getAllCinemas()).resolves.toEqual([
        { branchId: 2, name: 'Mall San Pedro', companyId: 1 },
        { branchId: 5, name: 'Multiplaza Escazú', companyId: 10 },
      ]);
      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Cinemas'),
      );
    });

    it.each([undefined, null, []])(
      'returns an empty list when database rows are %p',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });

        await expect(repository.getAllCinemas()).resolves.toEqual([]);
      },
    );

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getAllCinemas()).rejects.toBe(error);
    });
  });

  describe('listCinemas', () => {
    it('lists only active branches by ID with their company, one page at a time', async () => {
      mockList(23, [row, { ...row, ID: 2, NAME: null, COMPANY_NAME: null }]);

      await expect(
        repository.listCinemas({ ...query, page: 2 }),
      ).resolves.toEqual({
        items: [
          {
            id: 1,
            name: 'Sucursal Heredia Centro',
            companyId: 2,
            companyName: 'Cinetadel S.A',
          },
          { id: 2, name: null, companyId: 2, companyName: null },
        ],
        total: 23,
        page: 2,
        pageSize: 10,
        totalPages: 3,
      });
      const [countSql, countBinds] = call(0);
      expect(countSql).toContain("WHERE c.STATUS = 'ACTIVE'");
      expect(countSql).toContain(
        'JOIN COMPANIES p ON p.COMPANY_ID = c.COMPANY_ID',
      );
      expect(countBinds).toEqual({});
      const [sql, binds] = call(1);
      expect(sql).toContain('TRIM(c.NAME) AS NAME');
      expect(sql).toContain('TRIM(p.NAME) AS COMPANY_NAME');
      expect(sql).toContain('ORDER BY c.BRANCH_ID');
      expect(binds).toEqual({
        offset: { val: 10, type: oracle.NUMBER },
        pageSize: { val: 10, type: oracle.NUMBER },
      });
    });

    it('moves a page beyond the last one back to the last page', async () => {
      mockList(12, [row]);
      await expect(
        repository.listCinemas({ ...query, page: 9 }),
      ).resolves.toMatchObject({ page: 2, totalPages: 2 });
      expect(call(1)[1].offset.val).toBe(10);
    });

    it('skips the page query when nothing matches', async () => {
      databaseService.query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.listCinemas(query)).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(databaseService.query).toHaveBeenCalledTimes(1);
    });

    it('searches names ignoring case, accents and LIKE wildcards', async () => {
      mockList(0);
      await repository.listCinemas({ ...query, search: 'Peñas RAMÓN 50%_' });
      const [sql, binds] = call(0);
      expect(sql).toContain(
        "TRANSLATE(LOWER(c.NAME), 'áéíóúüñ', 'aeiouun') LIKE :search ESCAPE '\\'",
      );
      expect(sql).not.toContain('BRANCH_ID = :branchId');
      expect(binds).toEqual({
        search: { val: '%penas ramon 50\\%\\_%', type: oracle.STRING },
      });
    });

    it.each([
      ['SU-001', 1],
      ['su-12', 12],
      ['SU7', 7],
      ['007', 7],
      ['3', 3],
    ])('also matches the branch ID when searching %p', async (search, id) => {
      mockList(0);
      await repository.listCinemas({ ...query, search });
      const [sql, binds] = call(0);
      expect(sql).toContain('OR c.BRANCH_ID = :branchId)');
      expect(binds.branchId).toEqual({ val: id, type: oracle.NUMBER });
    });

    it.each(['SU-', 'SU-1a', 'SU 1', '1234567890123456'])(
      'does not treat %p as a branch ID',
      async (search) => {
        mockList(0);
        await repository.listCinemas({ ...query, search });
        expect(call(0)[1].branchId).toBeUndefined();
      },
    );

    it('filters by company', async () => {
      mockList(0);
      await repository.listCinemas({ ...query, companyId: 3 });
      const [sql, binds] = call(0);
      expect(sql).toContain('c.COMPANY_ID = :companyId');
      expect(binds).toEqual({ companyId: { val: 3, type: oracle.NUMBER } });
    });

    it.each([undefined, null, []])(
      'returns no items when the page rows are %p',
      async (rows) => {
        databaseService.query
          .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
          .mockResolvedValueOnce({ rows });
        await expect(repository.listCinemas(query)).resolves.toMatchObject({
          items: [],
          total: 1,
        });
      },
    );

    it('treats a missing count as zero', async () => {
      databaseService.query.mockResolvedValueOnce({});
      await expect(repository.listCinemas(query)).resolves.toMatchObject({
        total: 0,
      });
    });

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);
      await expect(repository.listCinemas(query)).rejects.toBe(error);
    });
  });

  describe('findCinemaById', () => {
    it('returns the branch of any status with its company', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ ...row, STATUS: 'INACTIVE' }],
      });
      await expect(repository.findCinemaById(1)).resolves.toEqual({
        id: 1,
        name: 'Sucursal Heredia Centro',
        companyId: 2,
        companyName: 'Cinetadel S.A',
        status: 'INACTIVE',
      });
      const [sql, binds] = call(0);
      expect(sql).toContain('WHERE c.BRANCH_ID = :id');
      expect(sql).not.toContain("STATUS = 'ACTIVE'");
      expect(binds).toEqual({ id: { val: 1, type: oracle.NUMBER } });
    });

    it('keeps names made of spaces as null', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ ...row, NAME: null, COMPANY_NAME: null, STATUS: 'ACTIVE' }],
      });
      await expect(repository.findCinemaById(1)).resolves.toMatchObject({
        name: null,
        companyName: null,
      });
    });

    it.each([undefined, []])(
      'returns null when the branch does not exist (rows %p)',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });
        await expect(repository.findCinemaById(99)).resolves.toBeNull();
      },
    );
  });

  describe('listCompanies', () => {
    it('lists every company by name, with nameless companies last', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          { ID: 2, NAME: 'Cinetadel S.A' },
          { ID: 5, NAME: null },
        ],
      });
      await expect(repository.listCompanies()).resolves.toEqual([
        { id: 2, name: 'Cinetadel S.A' },
        { id: 5, name: null },
      ]);
      expect(call(0)[0]).toContain('ORDER BY LOWER(TRIM(NAME)) NULLS LAST');
    });

    it.each([undefined, null])(
      'returns an empty list when rows are %p',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });
        await expect(repository.listCompanies()).resolves.toEqual([]);
      },
    );
  });

  describe('createCinema', () => {
    const connection = { execute: jest.fn() };
    const data = { name: 'Sucursal Heredia Centro', companyId: 21 };

    beforeEach(() => {
      connection.execute.mockReset();
      databaseService.transaction.mockImplementation(
        (work: (conn: typeof connection) => Promise<unknown>) =>
          work(connection),
      );
    });

    it('checks the company and the name, then inserts an active branch in one transaction', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowsAffected: 1, outBinds: { id: [30] } });

      await expect(repository.createCinema(data)).resolves.toBe(30);
      const [companySql, companyBinds, companyOptions] =
        connection.execute.mock.calls[0];
      expect(companySql).toContain('TRIM(NAME) IS NOT NULL');
      expect(companyBinds).toEqual({
        companyId: { val: 21, type: oracle.NUMBER },
      });
      expect(companyOptions).toEqual({ autoCommit: false });
      const [nameSql, nameBinds, nameOptions] =
        connection.execute.mock.calls[1];
      expect(nameSql).toContain("STATUS = 'ACTIVE'");
      expect(nameSql).not.toContain(':exceptId');
      expect(nameSql).toContain(
        "TRANSLATE(LOWER(TRIM(NAME)), 'áéíóúüñ', 'aeiouun') = TRANSLATE(LOWER(:name), 'áéíóúüñ', 'aeiouun')",
      );
      expect(nameBinds).toEqual({
        name: { val: 'Sucursal Heredia Centro', type: oracle.STRING },
      });
      expect(nameOptions).toEqual({ autoCommit: false });
      const [insertSql, insertBinds, insertOptions] =
        connection.execute.mock.calls[2];
      expect(insertSql).toContain('INSERT INTO CINEMAS (NAME, COMPANY_ID)');
      expect(insertBinds).toEqual({
        name: { val: 'Sucursal Heredia Centro', type: oracle.STRING },
        companyId: { val: 21, type: oracle.NUMBER },
        id: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      });
      expect(insertOptions).toEqual({ autoCommit: false });
    });

    it.each([undefined, []])(
      'does not insert when the company is unusable (rows %p)',
      async (rows) => {
        connection.execute.mockResolvedValueOnce({ rows });
        await expect(repository.createCinema(data)).resolves.toBe('company');
        expect(connection.execute).toHaveBeenCalledTimes(1);
      },
    );

    it('does not insert when an active branch already has the name', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      await expect(repository.createCinema(data)).resolves.toBe('duplicate');
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });

    it('reports the name as taken when the unique index rejects a concurrent insert', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: undefined })
        .mockRejectedValueOnce(
          Object.assign(
            new Error(
              'ORA-00001: unique constraint (PRODUCTION.UX_CINEMAS_ACTIVE_NAME) violated',
            ),
            { errorNum: 1 },
          ),
        );
      await expect(repository.createCinema(data)).resolves.toBe('duplicate');
    });

    it.each([
      Object.assign(new Error('ORA-00001: unique constraint (PK_CINEMAS)'), {
        errorNum: 1,
      }),
      Object.assign(new Error('ORA-03113: end-of-file'), { errorNum: 3113 }),
      { errorNum: 1 },
      null,
    ])('propagates other insert errors (%p)', async (error) => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(error);
      await expect(repository.createCinema(data)).rejects.toBe(error);
    });

    it.each([
      { rowsAffected: 0, outBinds: { id: [30] } },
      { rowsAffected: 1, outBinds: { id: [] } },
      { rowsAffected: 1 },
    ])(
      'fails when Oracle does not confirm one new branch (%p)',
      async (result) => {
        connection.execute
          .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce(result);
        await expect(repository.createCinema(data)).rejects.toThrow(
          'Oracle did not return a single created branch.',
        );
      },
    );
  });

  describe('updateCinema', () => {
    const connection = { execute: jest.fn() };
    const data = { name: 'Sucursal Heredia Oeste', companyId: 23 };

    beforeEach(() => {
      connection.execute.mockReset();
      databaseService.transaction.mockImplementation(
        (work: (conn: typeof connection) => Promise<unknown>) =>
          work(connection),
      );
    });

    it('changes the name and company of an active branch', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowsAffected: 1 });
      await expect(repository.updateCinema(26, data)).resolves.toBe('updated');
      const [nameSql, nameBinds] = connection.execute.mock.calls[1];
      expect(nameSql).toContain("STATUS = 'ACTIVE'");
      expect(nameSql).toContain('AND BRANCH_ID <> :exceptId');
      expect(nameBinds).toEqual({
        name: { val: 'Sucursal Heredia Oeste', type: oracle.STRING },
        exceptId: { val: 26, type: oracle.NUMBER },
      });
      const [sql, binds, options] = connection.execute.mock.calls[2];
      expect(sql).toContain(
        'UPDATE CINEMAS SET NAME = :name, COMPANY_ID = :companyId',
      );
      expect(sql).toContain("STATUS = 'ACTIVE'");
      expect(binds).toEqual({
        id: { val: 26, type: oracle.NUMBER },
        name: { val: 'Sucursal Heredia Oeste', type: oracle.STRING },
        companyId: { val: 23, type: oracle.NUMBER },
      });
      expect(options).toEqual({ autoCommit: false });
    });

    it('reports a missing or inactive branch', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(repository.updateCinema(99, data)).resolves.toBe('missing');
    });

    it('does not update when the company is unusable', async () => {
      connection.execute.mockResolvedValueOnce({ rows: [] });
      await expect(repository.updateCinema(26, data)).resolves.toBe('company');
      expect(connection.execute).toHaveBeenCalledTimes(1);
    });

    it('does not update when another active branch has the name', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      await expect(repository.updateCinema(26, data)).resolves.toBe(
        'duplicate',
      );
      expect(connection.execute).toHaveBeenCalledTimes(2);
    });

    it('reports the name as taken when the unique index rejects a concurrent update', async () => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(
          Object.assign(
            new Error(
              'ORA-00001: unique constraint (PRODUCTION.UX_CINEMAS_ACTIVE_NAME) violated',
            ),
            { errorNum: 1 },
          ),
        );
      await expect(repository.updateCinema(26, data)).resolves.toBe(
        'duplicate',
      );
    });

    it('propagates other update errors', async () => {
      const error = Object.assign(new Error('ORA-03113'), { errorNum: 3113 });
      connection.execute
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(error);
      await expect(repository.updateCinema(26, data)).rejects.toBe(error);
    });
  });
});
