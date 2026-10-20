import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MovieFunctionsRepository } from './movie-functions.repository';
import { DatabaseService } from '../../database/database.service';

describe('MovieFunctionsRepository', () => {
  let repository: MovieFunctionsRepository;
  let databaseService: { query: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovieFunctionsRepository,
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
      ],
    }).compile();

    repository = module.get<MovieFunctionsRepository>(MovieFunctionsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getMovieFunctions', () => {
    it('should return upcoming movie fuctions', async () => {
      const mockRows = [
        { title: 'Harry POTTER', posterImage: 'hp.jpg' },
        { title: 'lord of the rings', posterImage: 'lotr.jpg' },
      ];
      databaseService.query.mockResolvedValue({ rows: mockRows });

      const result = await repository.getMovieFunctions();

      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Movie_functions mf'),
      );
      expect(result).toEqual([
        { title: 'Harry POTTER', posterImage: 'hp.jpg' },
        { title: 'lord of the rings', posterImage: 'lotr.jpg' },
      ]);
    });

    it('should return empty list when result.rows is undefined', async () => {
      databaseService.query.mockResolvedValue({});

      const result = await repository.getMovieFunctions();

      expect(result).toEqual([]);
    });

    it('should return a empty list when result.rows is null', async () => {
      databaseService.query.mockResolvedValue({ rows: null });

      const result = await repository.getMovieFunctions();

      expect(result).toEqual([]);
    });

    it('should return an empty list when result.rows is empty', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      const result = await repository.getMovieFunctions();

      expect(result).toEqual([]);
    });

    it('should log when the query fails', async () => {
      const error = new Error('DB connection failed');
      databaseService.query.mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(repository.getMovieFunctions()).rejects.toThrow(error);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error fetching upcoming movie functions',
        error,
      );

      loggerSpy.mockRestore();
    });
  });
});