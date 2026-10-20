import { Test, TestingModule } from '@nestjs/testing';
import oracle from 'oracledb';
import { DatabaseService } from '../../database/database.service';
import { CinemasRepository } from './cinemas.repository';

describe('CinemasRepository', () => {
  let repository: CinemasRepository;
  let databaseService: { query: jest.Mock };
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
    databaseService = { query: jest.fn() };
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
});
