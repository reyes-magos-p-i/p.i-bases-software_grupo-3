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
    expect(sql).toContain('mf.start_time > SYSTIMESTAMP');
    expect(sql).toContain('GROUP BY mf.movie_id');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('ORDER BY u.next_start, m.movie_id');
    expect(sql).not.toContain('FETCH FIRST');
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
});
