import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MoviesRepository } from './movies.repository';
import { DatabaseService } from '../database/database.service';

describe('MoviesRepository', () => {
  let repository: MoviesRepository;
  let db: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const databaseMock = {
      query: jest.fn(),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoviesRepository,
        {
          provide: DatabaseService,
          useValue: databaseMock,
        },
      ],
    }).compile();

    repository = module.get(MoviesRepository);
    db = module.get(DatabaseService);
  });

  describe('findAll', () => {
    it('should return movie rows', async () => {
      const dbRows = [
        {
          MOVIE_ID: 24,
          TITLE: 'Interstellar',
          RUNNING_TIME: 169,
          RELEASE_YEAR: 2014,
          CLASSIFICATION: 'TP',
        },
      ];

      const expected = [
        {
          id: 24,
          title: 'Interstellar',
          runningTime: 169,
          releaseYear: 2014,
          classification: 'TP',
        },
      ];

      db.query.mockResolvedValue({
        rows: dbRows,
      });

      const result = await repository.findAll();

      expect(result).toEqual(expected);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

describe('findOne', () => {
  it('should return a movie with classification, languages and genres', async () => {
    const dbRows = [
      {
        MOVIE_ID: 24,
        TITLE: 'Interstellar',
        SYNOPSIS: 'A team travels through space searching for a new home.',
        RUNNING_TIME: 169,
        RELEASE_YEAR: 2014,
        CLASSIFICATION_ID: 1,
        CLASSIFICATION: 'TP',
        LANGUAGE_ID: 1,
        LANGUAGE: 'English',
        GENRE_ID: 3,
        GENRE: 'Adventure',
      },
      {
        MOVIE_ID: 24,
        TITLE: 'Interstellar',
        SYNOPSIS: 'A team travels through space searching for a new home.',
        RUNNING_TIME: 169,
        RELEASE_YEAR: 2014,
        CLASSIFICATION_ID: 1,
        CLASSIFICATION: 'TP',
        LANGUAGE_ID: 2,
        LANGUAGE: 'Spanish',
        GENRE_ID: 3,
        GENRE: 'Adventure',
      },
      {
        MOVIE_ID: 24,
        TITLE: 'Interstellar',
        SYNOPSIS: 'A team travels through space searching for a new home.',
        RUNNING_TIME: 169,
        RELEASE_YEAR: 2014,
        CLASSIFICATION_ID: 1,
        CLASSIFICATION: 'TP',
        LANGUAGE_ID: 1,
        LANGUAGE: 'English',
        GENRE_ID: 4,
        GENRE: 'Sci-Fi',
      },
      {
        MOVIE_ID: 24,
        TITLE: 'Interstellar',
        SYNOPSIS: 'A team travels through space searching for a new home.',
        RUNNING_TIME: 169,
        RELEASE_YEAR: 2014,
        CLASSIFICATION_ID: 1,
        CLASSIFICATION: 'TP',
        LANGUAGE_ID: 2,
        LANGUAGE: 'Spanish',
        GENRE_ID: 4,
        GENRE: 'Sci-Fi',
      },
    ];

      db.query.mockResolvedValue({
        rows: dbRows,
      });

      const result = await repository.findOne(24);

      expect(result).toEqual({
        id: 24,
        title: 'Interstellar',
        synopsis: 'A team travels through space searching for a new home.',
        runningTime: 169,
        releaseYear: 2014,

        classification: {
          id: 1,
          name: 'TP',
        },

        languages: [
          {
            id: 1,
            name: 'English',
          },
          {
            id: 2,
            name: 'Spanish',
          },
        ],

        genres: [
          {
            id: 3,
            name: 'Adventure',
          },
          {
            id: 4,
            name: 'Sci-Fi',
          },
        ],
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.MOVIE_ID = :id'),
        { id: 24 },
      );
    });

    it('should return null when the movie does not exist', async () => {
      db.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.findOne(999);

      expect(result).toBeNull();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.MOVIE_ID = :id'),
        { id: 999 },
      );
    });
  });

  describe('create', () => {
  it('should create a movie and its relationships inside a transaction', async () => {
    const dto = {
      title: 'Interstellar',
      synopsis: 'A team travels through space.',
      runningTime: 169,
      posterImage: 'blahblah.jpg',
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1, 2],
      genreIds: [3, 4],
    }

    const mockConnection = {
      execute: jest.fn(),
      executeMany: jest.fn(),
    }

    db.transaction.mockImplementation(
      async (work) => work(mockConnection as any),
    )

    mockConnection.execute.mockResolvedValueOnce({
      rowsAffected: 1,
      outBinds: {
        movieId: [24],
      },
    })


    mockConnection.executeMany.mockResolvedValue({
      rowsAffected: 2,
    })

    const result = await repository.create(dto)

    expect(db.transaction).toHaveBeenCalledTimes(1)

    expect(mockConnection.execute).toHaveBeenCalled()

    expect(mockConnection.executeMany).toHaveBeenCalled()

    expect(result).toBeDefined()
  })

  it('should propagate errors during create', async () => {
  const dto = {
    title: 'Interstellar',
    synopsis: 'Space movie',
    runningTime: 169,
    posterImage: 'jpen.jeg',
    releaseYear: 2014,
    classificationId: 1,
    languageIds: [1],
    genreIds: [3],
  }

  const error = new Error('Database error')

  db.transaction.mockRejectedValue(error)

  await expect(repository.create(dto)).rejects.toThrow(
    'Database error',
  )
})
});

  describe('catalogs', () => {
  it.each([
    ['findClassifications', [{ id: 1, name: 'TP' }]],
    ['findGenres', [{ id: 2, name: 'Drama' }]],
    ['findLanguages', [{ id: 3, name: 'Español' }]],
  ] as const)('%s returns database options', async (method, options) => {
    db.query.mockResolvedValueOnce({ rows: [...options] });

    const result = await repository[method]();

    expect(result).toEqual(options);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    'findClassifications',
    'findGenres',
    'findLanguages',
  ] as const)('%s returns an empty array without rows', async (method) => {
    db.query.mockResolvedValueOnce({ rows: undefined });

    expect(await repository[method]()).toEqual([]);
  });
});

describe('update', () => {
  const conn = {
    execute: jest.fn(),
    executeMany: jest.fn(),
  };

  beforeEach(() => {
    conn.execute.mockReset();
    conn.executeMany.mockReset();

    conn.execute.mockResolvedValue({ rowsAffected: 1 });
    conn.executeMany.mockResolvedValue({ rowsAffected: 1 });

    // Run the actual transaction callback using the mocked connection.
    db.transaction.mockImplementation(async (work) => {
      return work(conn as unknown as Parameters<typeof work>[0]);
    });
  });

  it('updates all scalar fields', async () => {
    await repository.update(24, {
      title: 'Interstellar',
      synopsis: 'A journey through space.',
      posterImage: 'default-poster',
      runningTime: 169,
      releaseYear: 2014,
      classificationId: 1,
    });

    expect(conn.execute).toHaveBeenNthCalledWith(
      1,
      'ALTER SESSION DISABLE PARALLEL DML',
    );

    expect(conn.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE MOVIES'),
      {
        id: 24,
        title: 'Interstellar',
        synopsis: 'A journey through space.',
        posterImage: 'default-poster',
        runningTime: 169,
        releaseYear: 2014,
        classificationId: 1,
      },
      { autoCommit: false },
    );

    expect(conn.executeMany).not.toHaveBeenCalled();
  });

  it('binds omitted scalar fields as null', async () => {
    await repository.update(24, { title: 'Updated title' });

    expect(conn.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE MOVIES'),
      {
        id: 24,
        title: 'Updated title',
        synopsis: null,
        posterImage: null,
        runningTime: null,
        releaseYear: null,
        classificationId: null,
      },
      { autoCommit: false },
    );
  });

  it('throws NotFoundException when the movie does not exist', async () => {
    conn.execute
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowsAffected: 0 });

    await expect(repository.update(999, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.executeMany).not.toHaveBeenCalled();
  });

  it('preserves relationships when their arrays are omitted', async () => {
    await repository.update(24, { title: 'Updated title' });

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.executeMany).not.toHaveBeenCalled();
  });

  it('clears languages and genres when arrays are empty', async () => {
    await repository.update(24, {
      languageIds: [],
      genreIds: [],
    });

    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM MOVIE_LANGUAGES'),
      { id: 24 },
      { autoCommit: false },
    );

    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM MOVIE_GENRES'),
      { id: 24 },
      { autoCommit: false },
    );

    expect(conn.executeMany).not.toHaveBeenCalled();
  });

  it('replaces relationships and removes duplicate IDs', async () => {
    await repository.update(24, {
      languageIds: [1, 1, 2],
      genreIds: [3, 3, 4],
    });

    expect(conn.executeMany).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO MOVIE_LANGUAGES'),
      [
        { id: 24, languageId: 1 },
        { id: 24, languageId: 2 },
      ],
      { autoCommit: false },
    );

    expect(conn.executeMany).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO MOVIE_GENRES'),
      [
        { id: 24, genreId: 3 },
        { id: 24, genreId: 4 },
      ],
      { autoCommit: false },
    );
  });

  it('propagates an update failure and stops further statements', async () => {
    const failure = new Error('Database update failed');

    conn.execute
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(failure);

    await expect(
      repository.update(24, { languageIds: [1], genreIds: [2] }),
    ).rejects.toThrow(failure);

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.executeMany).not.toHaveBeenCalled();
  });

  it('propagates relationship insertion failures', async () => {
    const failure = new Error('Language insert failed');
    conn.executeMany.mockRejectedValueOnce(failure);

    await expect(
      repository.update(24, { languageIds: [1], genreIds: [2] }),
    ).rejects.toThrow(failure);

    // Genre modification must not start after the language failure.
    expect(conn.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM MOVIE_GENRES'),
      expect.anything(),
      expect.anything(),
    );
  });
});

});
