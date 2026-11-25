import { DatabaseService } from '../database/database.service';
import { SalesStatisticsRepository } from './sales-statistics.repository';

describe('SalesStatisticsRepository', () => {
  const db = { query: jest.fn() };
  const repository = new SalesStatisticsRepository(
    db as unknown as DatabaseService,
  );
  beforeEach(() => jest.resetAllMocks());

  it.each([
    ['day', "TO_CHAR(PURCHASE_DATE,'YYYY-MM-DD')"],
    ['week', "TRUNC(PURCHASE_DATE,'IW')"],
    ['month', "TRUNC(PURCHASE_DATE,'MM')"],
    ['year', "TRUNC(PURCHASE_DATE,'YYYY')"],
  ] as const)(
    'groups the same paid cohort by %s in one statement',
    async (grouping, expectedBucket) => {
      const rows = [
        { DIMENSION: 'summary', REVENUE: 15000, TICKETS: 4, PURCHASES: 2 },
      ];
      db.query.mockResolvedValue({ rows });
      const result = await repository.read(
        { dateFrom: '2026-11-01', dateTo: '2026-11-21' },
        grouping,
      );
      expect(result).toBe(rows);
      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, binds] = db.query.mock.calls[0] as [string, object];
      expect(binds).toEqual({
        dateFrom: '2026-11-01',
        dateTo: '2026-11-21',
        minAge: null,
        maxAge: null,
      });
      expect(sql).toContain(expectedBucket);
      expect(sql).toContain("WHERE i.STATUS='PAID'");
      expect(sql).toContain('GROUP BY ip.INVOICE_ID');
      expect(sql).toContain("p.PRODUCT_TYPE='TICKET'");
      expect(sql).toContain("AT TIME ZONE 'America/Costa_Rica'");
      expect(sql).toContain('LEFT JOIN CLIENTS');
      expect(sql).toContain('a.ID_ADDRESS=c.ID_ADDRESS');
      expect(sql).not.toMatch(/c\.STATUS|b\.STATUS|f\.STATUS/u);
      expect(sql).not.toContain('CLIENT_EMAIL');
    },
  );
  it('binds age bounds only in the demographic cohort', async () => {
    db.query.mockResolvedValue({});
    expect(
      await repository.read(
        { dateFrom: '2026-11-01', dateTo: '2026-11-21', minAge: 0, maxAge: 17 },
        'day',
      ),
    ).toEqual([]);
    const [sql, binds] = db.query.mock.calls[0] as [string, object];
    expect(binds).toMatchObject({ minAge: 0, maxAge: 17 });
    expect(sql).toContain(
      'AS TICKETS, COUNT(*) AS PURCHASES FROM age_sales GROUP BY',
    );
    expect(sql).toContain(
      'AS TICKETS, COUNT(*) AS PURCHASES FROM sales GROUP BY GENDER_KEY',
    );
    expect(sql).toContain("TO_CHAR(c.BIRTHDAY,'MMDD')");
    expect(sql).toContain("SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica'");
    expect(sql).toContain(
      'EXTRACT(YEAR FROM clock.TODAY)-EXTRACT(YEAR FROM c.BIRTHDAY)',
    );
    expect(sql).not.toContain('EXTRACT(YEAR FROM paid.PURCHASE_DATE)');
  });
  it('propagates query failures without substituting fabricated statistics', async () => {
    const failure = new Error('Database unavailable');
    db.query.mockRejectedValue(failure);
    await expect(
      repository.read({ dateFrom: '2026-11-01', dateTo: '2026-11-21' }, 'day'),
    ).rejects.toBe(failure);
  });
  it('isolates category attribution from the unique invoice cohort and never sums distinct amounts', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await repository.read(
      { dateFrom: '2026-11-01', dateTo: '2026-11-30' },
      'day',
    );
    const [sql] = db.query.mock.calls[0] as [string];
    const [cohort, projections] = sql.split("SELECT 'summary'");
    expect(cohort).toContain('GROUP BY ip.INVOICE_ID');
    expect(cohort).not.toContain('MOVIE_GENRES');
    expect(cohort).not.toContain('MOVIE_LANGUAGES');
    const branches = projections.split('UNION ALL');
    expect(branches).toHaveLength(9);
    expect(
      branches
        .slice(0, -2)
        .every(
          (branch) =>
            !branch.includes('MOVIE_GENRES') &&
            !branch.includes('MOVIE_LANGUAGES'),
        ),
    ).toBe(true);
    expect(branches.at(-2)).toContain(
      'MOVIE_GENRES mg ON mg.MOVIE_ID=s.MOVIE_ID',
    );
    expect(branches.at(-2)).not.toContain('MOVIE_LANGUAGES');
    expect(branches.at(-1)).toContain(
      'MOVIE_LANGUAGES ml ON ml.MOVIE_ID=s.MOVIE_ID',
    );
    expect(branches.at(-1)).not.toContain('MOVIE_GENRES');
    expect(sql).not.toMatch(/SUM\s*\(\s*DISTINCT/iu);
  });
});
