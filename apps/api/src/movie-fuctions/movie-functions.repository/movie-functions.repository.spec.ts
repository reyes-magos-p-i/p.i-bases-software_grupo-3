import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MovieFunctionsRepository } from './movie-functions.repository';
import { DatabaseService } from '../../database/database.service';

describe('MovieFunctionsRepository', () => {
  let module: TestingModule;
  let repository: MovieFunctionsRepository;
  const database = { query: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    module = await Test.createTestingModule({
      providers: [
        MovieFunctionsRepository,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    repository = module.get(MovieFunctionsRepository);
  });
  afterEach(async () => {
    await module.close();
    jest.restoreAllMocks();
  });

  it('collects genres and languages without repeating movies', async () => {
    database.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          title: 'Primera',
          posterImage: '1.jpg',
          kind: 'GENRE',
          optionId: 2,
        },
        {
          id: 1,
          title: 'Primera',
          posterImage: '1.jpg',
          kind: 'GENRE',
          optionId: 3,
        },
        {
          id: 1,
          title: 'Primera',
          posterImage: '1.jpg',
          kind: 'LANGUAGE',
          optionId: 2,
        },
        {
          id: 2,
          title: 'Segunda',
          posterImage: '2.jpg',
          kind: null,
          optionId: null,
        },
      ],
    });
    await expect(repository.getCatalogCandidates()).resolves.toEqual([
      {
        id: 1,
        title: 'Primera',
        posterImage: '1.jpg',
        genreIds: [2, 3],
        languageIds: [2],
      },
      {
        id: 2,
        title: 'Segunda',
        posterImage: '2.jpg',
        genreIds: [],
        languageIds: [],
      },
    ]);
    expect(database.query).toHaveBeenCalledTimes(1);
    const sql = database.query.mock.calls[0][0] as string;
    expect(sql).toContain("mf.status = 'ACTIVE'");
    expect(sql).toContain(
      "mf.start_time > CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS TIMESTAMP)",
    );
    expect(sql).toContain('GROUP BY mf.movie_id');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('ORDER BY u.next_start, m.movie_id');
    expect(sql).not.toContain('FETCH FIRST');
    expect(sql).toContain("s.SEAT_STATE='libre'");
    expect(sql).toContain('s.ROW_NUMBER BETWEEN 1 AND t.DIMENSION_X');
    expect(sql).toContain('s.COLUMN_NUMBER BETWEEN 1 AND t.DIMENSION_Y');
    expect(sql).toContain('tk.MOVIE_FUNCTION_ID=mf.MOVIE_FUNCTION_ID');
    expect(sql).toContain(
      'tk.SEAT_ROW=s.ROW_NUMBER AND tk.SEAT_COLUMN=s.COLUMN_NUMBER',
    );
  });
  it('preserves the legacy four-item response while the full catalog remains complete', async () => {
    const rows = Array.from({ length: 6 }, (_item, index) => ({
      id: index + 1,
      title: `Movie ${index + 1}`,
      posterImage: `${index + 1}.jpg`,
      kind: null,
      optionId: null,
    }));
    database.query.mockResolvedValue({ rows });
    await expect(repository.getMovieFunctions()).resolves.toEqual(
      rows
        .slice(0, 4)
        .map(({ title, posterImage }) => ({ title, posterImage })),
    );
    await expect(repository.getCatalogCandidates()).resolves.toHaveLength(6);
  });
  it.each([{}, { rows: null }, { rows: [] }])(
    'returns an empty catalog for %p',
    async (result) => {
      database.query.mockResolvedValue(result);
      await expect(repository.getMovieFunctions()).resolves.toEqual([]);
    },
  );
  it('does not classify unknown association kinds as a genre or language', async () => {
    database.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          title: 'Primera',
          posterImage: '1.jpg',
          kind: 'UNKNOWN',
          optionId: 7,
        },
      ],
    });
    await expect(repository.getCatalogCandidates()).resolves.toMatchObject([
      { genreIds: [], languageIds: [] },
    ]);
  });
  it('propagates query failures through the existing logging path', async () => {
    const error = new Error('DB connection failed');
    database.query.mockRejectedValue(error);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    await expect(repository.getMovieFunctions()).rejects.toThrow(error);
    expect(logger).toHaveBeenCalledWith(
      'Error fetching upcoming movie functions',
      error,
    );
  });

  it('loads the requested account purchase affinities in one aggregated query', async () => {
    database.query.mockResolvedValue({
      rows: [
        { kind: 'MOVIE', id: 10, purchaseCount: 2 },
        { kind: 'MOVIE', id: 20, purchaseCount: 1 },
        { kind: 'GENRE', id: 1, purchaseCount: 3 },
        { kind: 'GENRE', id: 2, purchaseCount: 1 },
        { kind: 'LANGUAGE', id: 1, purchaseCount: 3 },
      ],
    });
    await expect(repository.getPurchaseHistory(7)).resolves.toEqual({
      purchasedMovieIds: [10, 20],
      genres: [
        { id: 1, purchaseCount: 3 },
        { id: 2, purchaseCount: 1 },
      ],
      languages: [{ id: 1, purchaseCount: 3 }],
    });
    expect(database.query).toHaveBeenCalledTimes(1);
    const [sql, binds] = database.query.mock.calls[0] as [string, unknown];
    expect(binds).toEqual({ clientId: 7 });
    expect(sql).toContain("i.CLIENT_ID = :clientId AND i.STATUS = 'PAID'");
    expect(sql).toContain("p.PRODUCT_TYPE = 'TICKET' AND ip.QUANTITY > 0");
    expect(sql).toContain('COUNT(DISTINCT p.INVOICE_ID)');
    expect(sql).not.toContain('SUM(ip.QUANTITY)');
    expect(sql).not.toContain('BUYER_EMAIL');
    expect(sql).not.toContain('FETCH FIRST');
    expect(sql).not.toContain('START_TIME >');
  });

  it('supports legacy invoices and current rescheduled tickets without counting cancelled functions', async () => {
    database.query.mockResolvedValue({ rows: [] });
    await expect(repository.getPurchaseHistory(9)).resolves.toEqual({
      purchasedMovieIds: [],
      genres: [],
      languages: [],
    });
    const sql = database.query.mock.calls[0][0] as string;
    expect(sql).toContain('tk.INVOICE_ID = i.INVOICE_ID');
    expect(sql).toContain(
      "current_mf.STATUS IN ('ACTIVE', 'IN_PROGRESS', 'FINISHED')",
    );
    expect(sql).toContain(
      'NOT EXISTS (SELECT 1 FROM TICKETS tk WHERE tk.INVOICE_ID = i.INVOICE_ID)',
    );
    expect(sql).toContain("mf.STATUS IN ('ACTIVE', 'IN_PROGRESS', 'FINISHED')");
  });

  it.each([{}, { rows: null }, { rows: [] }])(
    'handles empty purchase history %p',
    async (result) => {
      database.query.mockResolvedValue(result);
      await expect(repository.getPurchaseHistory(7)).resolves.toEqual({
        purchasedMovieIds: [],
        genres: [],
        languages: [],
      });
    },
  );

  it('propagates history errors instead of returning a successful empty history', async () => {
    database.query.mockRejectedValue(new Error('History unavailable'));
    await expect(repository.getPurchaseHistory(7)).rejects.toThrow(
      'History unavailable',
    );
  });
});
