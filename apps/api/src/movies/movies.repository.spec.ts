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
      const rows = [
        {
          MOVIE_ID: 1,
          TITLE: 'Interstellar',
        },
      ];

      db.query.mockResolvedValue({
        rows,
      } as any);

      const result = await repository.findAll();

      expect(result).toEqual(rows);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should query using movie id', async () => {
      const rows = [
        {
          MOVIE_ID: 1,
          TITLE: 'Interstellar',
        },
      ];

      db.query.mockResolvedValue({
        rows,
      } as any);

      const result = await repository.findOne(1);

      expect(result).toEqual(rows);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.MOVIE_ID = :id'),
        { id: 1 },
      );
    });
  });

  describe('create', () => {
  it('should create a movie and its relationships inside a transaction', async () => {
    const dto = {
      title: 'Interstellar',
      runningTime: 169,
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

});
