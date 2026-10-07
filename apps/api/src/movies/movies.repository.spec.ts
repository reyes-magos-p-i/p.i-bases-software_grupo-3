import { Test, TestingModule } from '@nestjs/testing';

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

  describe('update', () => {
    it('should update the movie inside a transaction', async () => {
      const dto = {
        title: 'Updated Interstellar',
        synopsis: 'Updated synopsis',
        runningTime: 170,
        releaseYear: 2015,
        classificationId: 2,
        languageIds: [1, 2],
        genreIds: [3, 4],
      }

      const conn = {
        execute: jest.fn(),
        executeMany: jest.fn(),
      }

      db.transaction.mockImplementation(
        async (work) => work(conn as any),
      )

      conn.execute.mockResolvedValue({
        rowsAffected: 1,
      })

      conn.executeMany.mockResolvedValue({
        rowsAffected: 2,
      })

      await repository.update(24, dto)

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(conn.execute).toHaveBeenCalled()
    })
  })

  describe('update', () => {
  it('should update the movie inside a transaction', async () => {
    const dto = {
      title: 'Updated Interstellar',
      synopsis: 'Updated synopsis',
      runningTime: 170,
      releaseYear: 2015,
      classificationId: 2,
      languageIds: [1, 2],
      genreIds: [3, 4],
    }

    const conn = {
      execute: jest.fn(),
      executeMany: jest.fn(),
    }

      db.transaction.mockImplementation(
        async (work) => work(conn as any),
      )

      conn.execute.mockResolvedValue({
        rowsAffected: 1,
      })

      conn.executeMany.mockResolvedValue({
        rowsAffected: 2,
      })

      await repository.update(24, dto)

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(conn.execute).toHaveBeenCalled()
    })
  })

    it('should propagate database errors when deleting', async () => {
      db.transaction.mockRejectedValue(
        new Error('Database error'),
      )

      await expect(
        repository.remove(24),
      ).rejects.toThrow('Database error')
    })

});
