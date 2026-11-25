
import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MoviesRepository } from './movies.repository';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';

describe('MoviesRepository', () => {
  let repository: MoviesRepository;

  let query: jest.Mock;
  let execute: jest.Mock;
  let executeMany: jest.Mock;
  let transaction: jest.Mock;

  const createDto: CreateMovieDto = {
    title: 'Interstellar',
    synopsis: 'Space adventure',
    runningTime: 169,
    posterImage: '',
    releaseYear: 2014,
    classificationId: 1,
    languageIds: [1, 2],
    genreIds: [3]
  };

  beforeEach(() => {
    query = jest.fn();
    execute = jest.fn();
    executeMany = jest.fn();

    // Execute the transaction callback using a mock connection
    transaction = jest.fn(async (
      callback: (conn: {
        execute: jest.Mock;
        executeMany: jest.Mock;
      }) => Promise<unknown>
    ) => callback({ execute, executeMany }));

    const db = {
      query,
      transaction
    } as unknown as DatabaseService;

    repository = new MoviesRepository(db);
  });

  describe('findAll', () => {
    it('returns mapped movies', async () => {
      query.mockResolvedValue({
        rows: [{
          MOVIE_ID: 24,
          TITLE: 'Interstellar',
          RUNNING_TIME: 169,
          RELEASE_YEAR: 2014,
          CLASSIFICATION: 'TP'
        }]
      });

      const result = await repository.findAll();

      expect(result).toEqual([{
        id: 24,
        title: 'Interstellar',
        runningTime: 169,
        releaseYear: 2014,
        classification: 'TP'
      }]);
    });

    it('returns an empty array when no movies exist', async () => {
      query.mockResolvedValue({ rows: [] });

      expect(await repository.findAll()).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns a movie with unique languages and genres', async () => {
      const row = {
        MOVIE_ID: 24,
        TITLE: 'Interstellar',
        SYNOPSIS: 'Space adventure',
        RUNNING_TIME: 169,
        RELEASE_YEAR: 2014,
        CLASSIFICATION_ID: 1,
        CLASSIFICATION: 'TP',
        LANGUAGE_ID: 1,
        LANGUAGE: 'Español',
        GENRE_ID: 3,
        GENRE: 'Aventura'
      };

      query
        .mockResolvedValueOnce({
          rows: [
            row,
            { ...row, GENRE_ID: 4, GENRE: 'Drama' },
            { ...row, LANGUAGE_ID: 2, LANGUAGE: 'Inglés' }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ id: 27, name: 'Cinetadel Multiplaza Escazú' }] });

      const result = await repository.findOne(24);

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        { id: 24 }
      );
      expect(query.mock.calls[1][0]).toContain('FROM CINEMA_MOVIES cm');
      expect(query.mock.calls[1][0]).toContain("c.STATUS = 'ACTIVE'");

      expect(result).toEqual({
        id: 24,
        title: 'Interstellar',
        synopsis: 'Space adventure',
        posterImage: null,
        releaseDate: null,
        presaleStart: null,
        runningTime: 169,
        releaseYear: 2014,
        classification: { id: 1, name: 'TP' },
        languages: [
          { id: 1, name: 'Español' },
          { id: 2, name: 'Inglés' }
        ],
        genres: [
          { id: 3, name: 'Aventura' },
          { id: 4, name: 'Drama' }
        ],
        branches: [{ id: 27, name: 'Cinetadel Multiplaza Escazú' }]
      });
    });

    it('returns no branches when the branch query has no rows', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ MOVIE_ID: 24, CLASSIFICATION_ID: 1 }] })
        .mockResolvedValueOnce({});

      expect((await repository.findOne(24))?.branches).toEqual([]);
    });

    it('returns the release and presale dates as YYYY-MM-DD', async () => {
      query.mockResolvedValue({
        rows: [
          {
            MOVIE_ID: 24,
            TITLE: 'Interstellar',
            CLASSIFICATION_ID: 1,
            CLASSIFICATION: 'TP',
            RELEASE_DATE: '2026-12-04',
            PRESALE_START: '2026-11-15',
          },
        ],
      });

      const result = await repository.findOne(24);

      expect(query.mock.calls[0][0]).toContain(
        "TO_CHAR(m.RELEASE_DATE, 'YYYY-MM-DD') AS RELEASE_DATE",
      );
      expect(result).toMatchObject({
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });
    });

    it('returns null when the movie does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      expect(await repository.findOne(99)).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a movie with languages and genres', async () => {
      execute.mockResolvedValue({
        outBinds: { movieId: [24] }
      });

      const result = await repository.create(createDto);

      expect(result).toBe(24);
      expect(transaction).toHaveBeenCalledTimes(1);

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO MOVIES'),
        expect.objectContaining({
          title: 'Interstellar',
          classificationId: 1
        })
      );

      expect(executeMany).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO MOVIE_LANGUAGES'),
        [
          { movieId: 24, languageId: 1 },
          { movieId: 24, languageId: 2 }
        ]
      );

      expect(executeMany).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO MOVIE_GENRES'),
        [{ movieId: 24, genreId: 3 }]
      );
    });

    it('stores the release and presale dates, or NULL when they are absent', async () => {
      execute.mockResolvedValue({ outBinds: { movieId: [24] } });

      await repository.create(createDto);
      await repository.create({
        ...createDto,
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });

      expect(execute.mock.calls[0][0]).toContain(
        "TO_DATE(:releaseDate, 'YYYY-MM-DD')",
      );
      expect(execute.mock.calls[0][1]).toMatchObject({
        releaseDate: null,
        presaleStart: null,
      });
      expect(execute.mock.calls[1][1]).toMatchObject({
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });
    });

    it('makes the movie available in the selected branches', async () => {
      execute.mockResolvedValue({ outBinds: { movieId: [24] } });

      await repository.create({ ...createDto, branchIds: [1, 27] });

      expect(executeMany).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO CINEMA_MOVIES'),
        [
          { branchId: 1, movieId: 24 },
          { branchId: 27, movieId: 24 }
        ]
      );
    });

    it('creates a movie without relationships', async () => {
      execute.mockResolvedValue({
        outBinds: { movieId: [24] }
      });

      const result = await repository.create({
        ...createDto,
        languageIds: [],
        genreIds: []
      });

      expect(result).toBe(24);
      expect(executeMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes relationships before deleting the movie', async () => {
      execute.mockResolvedValue({ rowsAffected: 1 });

      await repository.remove(24);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(5);

      expect(execute).toHaveBeenNthCalledWith(
        1,
        'ALTER SESSION DISABLE PARALLEL DML'
      );

      expect(execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM MOVIE_GENRES'),
        { id: 24 }
      );

      expect(execute).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('DELETE FROM MOVIE_LANGUAGES'),
        { id: 24 }
      );

      expect(execute).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('DELETE FROM CINEMA_MOVIES'),
        { id: 24 }
      );

      expect(execute).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining('FROM MOVIES'),
        { id: 24 }
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      execute.mockResolvedValue({ rowsAffected: 1 });
    });

    it('updates movie information', async () => {
      await repository.update(24, {
        title: 'Updated title',
        runningTime: 180
      });

      expect(execute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE MOVIES'),
        expect.objectContaining({
          id: 24,
          title: 'Updated title',
          runningTime: 180,
          synopsis: null,
          classificationId: null
        }),
        { autoCommit: false }
      );

      expect(executeMany).not.toHaveBeenCalled();
    });

    it('keeps absent dates, clears null dates and replaces given dates', async () => {
      await repository.update(24, { title: 'Updated title' });
      await repository.update(24, { releaseDate: null, presaleStart: null });
      await repository.update(24, {
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });

      const binds = execute.mock.calls
        .filter(([sql]) => String(sql).includes('UPDATE MOVIES'))
        .map(([, values]) => values as Record<string, unknown>);
      expect(binds[0]).toMatchObject({
        releaseDateSent: 0,
        presaleStartSent: 0,
      });
      expect(binds[1]).toMatchObject({
        releaseDateSent: 1,
        releaseDate: null,
        presaleStartSent: 1,
        presaleStart: null,
      });
      expect(binds[2]).toMatchObject({
        releaseDateSent: 1,
        releaseDate: '2026-12-04',
        presaleStartSent: 1,
        presaleStart: '2026-11-15',
      });
    });

    it('updates languages and genres without duplicates', async () => {
      await repository.update(24, {
        languageIds: [1, 1, 2],
        genreIds: [3, 3]
      });

      expect(executeMany).toHaveBeenCalledTimes(2);

      expect(executeMany).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO MOVIE_LANGUAGES'),
        [
          { id: 24, languageId: 1 },
          { id: 24, languageId: 2 }
        ],
        { autoCommit: false }
      );

      expect(executeMany).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO MOVIE_GENRES'),
        [{ id: 24, genreId: 3 }],
        { autoCommit: false }
      );
    });

    it('removes relationships when arrays are empty', async () => {
      await repository.update(24, {
        languageIds: [],
        genreIds: []
      });

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM MOVIE_LANGUAGES'),
        { id: 24 },
        { autoCommit: false }
      );

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM MOVIE_GENRES'),
        { id: 24 },
        { autoCommit: false }
      );

      expect(executeMany).not.toHaveBeenCalled();
    });

    it('turns off unselected active branches and turns on or adds the selected ones', async () => {
      await repository.update(24, { branchIds: [27, 1, 27] });

      expect(execute).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE CINEMA_MOVIES cm\s+SET IS_AVAILABLE = 0[\s\S]*c\.STATUS = 'ACTIVE'/),
        { id: 24 },
        { autoCommit: false }
      );
      expect(executeMany).toHaveBeenCalledWith(
        expect.stringContaining('MERGE INTO CINEMA_MOVIES'),
        [
          { id: 24, branchId: 27 },
          { id: 24, branchId: 1 }
        ],
        { autoCommit: false }
      );
    });

    it('turns off every active branch when the list is empty', async () => {
      await repository.update(24, { branchIds: [] });

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('SET IS_AVAILABLE = 0'),
        { id: 24 },
        { autoCommit: false }
      );
      expect(executeMany).not.toHaveBeenCalled();
    });

    it('keeps branch availability when branchIds is absent', async () => {
      await repository.update(24, { title: 'Updated' });

      expect(execute).not.toHaveBeenCalledWith(
        expect.stringContaining('CINEMA_MOVIES'),
        expect.anything(),
        expect.anything()
      );
    });

    it('throws NotFoundException when the movie does not exist', async () => {
      execute
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowsAffected: 0 });

      await expect(
        repository.update(99, { title: 'Updated' })
      ).rejects.toThrow(NotFoundException);

      expect(executeMany).not.toHaveBeenCalled();
    });
  });

  describe('catalogs', () => {
    it('returns classifications, genres and languages', async () => {
      const options = [{ id: 1, name: 'Example' }];
      query.mockResolvedValue({ rows: options });

      expect(await repository.findClassifications()).toEqual(options);
      expect(await repository.findGenres()).toEqual(options);
      expect(await repository.findLanguages()).toEqual(options);
      expect(await repository.findBranches()).toEqual(options);

      expect(query).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(/FROM CINEMAS\s+WHERE STATUS = 'ACTIVE'/)
      );
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FROM CLASSIFICATIONS')
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM GENRES')
      );
      expect(query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('FROM LANGUAGES')
      );
    });

    it('returns empty arrays when catalogs have no rows', async () => {
      query.mockResolvedValue({});

      expect(await repository.findClassifications()).toEqual([]);
      expect(await repository.findGenres()).toEqual([]);
      expect(await repository.findLanguages()).toEqual([]);
      expect(await repository.findBranches()).toEqual([]);
    });
  });
});
