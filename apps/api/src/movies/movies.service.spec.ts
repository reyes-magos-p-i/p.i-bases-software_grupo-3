import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { MoviesService } from './movies.service';
import { MoviesRepository } from './movies.repository';

describe('MoviesService', () => {
 let service: MoviesService;
  let repository: jest.Mocked<MoviesRepository>;

  beforeEach(async () => {
    const repositoryMock = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoviesService,
        {
          provide: MoviesRepository,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<MoviesService>(MoviesService);
    repository = module.get(MoviesRepository);
  });

  describe('findAll', () => {
    it('should return all movies', async () => {
      const movies = [
        {
          MOVIE_ID: 1,
          TITLE: 'Interstellar',
          RUNNING_TIME: 169,
          RELEASE_YEAR: 2014,
          CLASSIFICATION_NAME: 'PG-13',
          LANGUAGE_NAME: 'English',
          GENRE_NAME: 'Sci-Fi',
        },
      ];

      repository.findAll.mockResolvedValue(movies);

      const result = await service.findAll();

      expect(result).toEqual(movies);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a movie when it exists', async () => {
      const movie = [
        {
          MOVIE_ID: 1,
          TITLE: 'Interstellar',
          RUNNING_TIME: 169,
          RELEASE_YEAR: 2014,
          CLASSIFICATION_NAME: 'PG-13',
          LANGUAGE_NAME: 'English',
          GENRE_NAME: 'Sci-Fi',
        },
      ];

      repository.findOne.mockResolvedValue(movie);

      const result = await service.findOne(1);

      expect(result).toEqual(movie);
      expect(repository.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when movie does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        NotFoundException,
      );

      expect(repository.findOne).toHaveBeenCalledWith(999);
    });
  });
});
