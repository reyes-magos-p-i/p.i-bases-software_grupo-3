
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

      query.mockResolvedValue({
        rows: [
          row,
          { ...row, GENRE_ID: 4, GENRE: 'Drama' },
          { ...row, LANGUAGE_ID: 2, LANGUAGE: 'Inglés' }
        ]
      });

      const result = await repository.findOne(24);

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        { id: 24 }
      );

      expect(result).toEqual({
        id: 24,
        title: 'Interstellar',
        synopsis: 'Space adventure',
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
        ]
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
      expect(execute).toHaveBeenCalledTimes(4);

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
    });
  });
});
