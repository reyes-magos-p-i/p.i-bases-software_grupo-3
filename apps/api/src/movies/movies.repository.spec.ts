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
/*
  describe('create', () => {
  it('should create a movie and its relationships inside a transaction', async () => {
    const dto = {
      title: 'Interstellar',
      runningTime: 169,
      synopsis: 'Cristopher nolar goes to space AAAAAA',
      posterImage:'intertelas.jpg',
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1, 2],
      genreIds: [3, 4],
    };

    const execute = jest.fn();

    execute
      .mockResolvedValueOnce({
        outBinds: {
          movieId: [10],
        },
      })
      .mockResolvedValue({});

    db.transaction.mockImplementation(async (work: any) => {
      return work({
        execute,
      });
    });

    const result = await repository.create(dto);

    expect(result).toBe(10);

    expect(db.transaction).toHaveBeenCalledTimes(1);

    expect(execute).toHaveBeenCalledTimes(5);
  });
});
*/
});
