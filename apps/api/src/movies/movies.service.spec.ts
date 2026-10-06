import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { MoviesService } from './movies.service';
import { MoviesRepository } from './movies.repository';

describe('MoviesService', () => {
  let service: MoviesService;
  let repository: jest.Mocked<MoviesRepository>;

  const movie = [
    {
      MOVIE_ID: 1,
      TITLE: 'Interstellar',
      RUNNING_TIME: 169,
      SYNOPSIS: 'Cristopher nolar goes to space AAAAAA',
      POSTER_IMAGE: 'Interstelar.jpg',
      RELEASE_YEAR: 2014,
      CLASSIFICATION_NAME: 'PG-13',
      LANGUAGE_NAME: 'English',
      GENRE_NAME: 'Sci-Fi',
    },
  ];

    const movieAll = [
    {
    id: 24,
    title: 'Interstellar',
    runningTime: 169,
    releaseYear: 2014,
    classification: 'TP',
      },
    ];

  const movieDetail = {
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
        name: 'afar',
      },
      {
        id: 2,
        name: 'abjasio',
      },
    ],

    genres: [
      {
        id: 3,
        name: 'Aventura',
      },
      {
        id: 4,
        name: 'Ciencia Ficción',
      },
    ],
  }

  beforeEach(async () => {
    const repositoryMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
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

    service = module.get(MoviesService);
    repository = module.get(MoviesRepository);
  });

  describe('findAll', () => {
    it('should return all movies', async () => {
      repository.findAll.mockResolvedValue(movieAll);

      const result = await service.findAll();

      expect(result).toEqual(movie);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a movie', async () => {
      repository.findOne.mockResolvedValue(movieDetail);

      const result = await service.findOne(1);

      expect(result).toEqual(movie);
      expect(repository.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when movie does not exist', async () => {
      repository.findOne.mockResolvedValue(movieDetail);

      await expect(service.findOne(999)).rejects.toThrow(
        NotFoundException,
      );

      expect(repository.findOne).toHaveBeenCalledWith(999);
    });
  });

  describe('create', () => {
    it('should create a movie', async () => {
      const dto = {
        title: 'Interstellar',
        runningTime: 169,
        synopsis: 'Cristopher nolar goes to space AAAAAA',
        posterImage:'intertelas.jpg',
        releaseYear: 2014,
        classificationId: 1,
        languageIds: [1],
        genreIds: [2],
      };

      repository.create.mockResolvedValue(10);

      const result = await service.create(dto);

      expect(result).toEqual(10);
      expect(repository.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update an existing movie', async () => {
      const dto = {
        title: 'Updated Interstellar',
      };

      repository.findOne
        .mockResolvedValueOnce(movieDetail)
        .mockResolvedValueOnce([
          {
            ...movie[0],
            TITLE: 'Updated Interstellar',
          },
        ]);

      repository.update.mockResolvedValue(undefined);

      const result = await service.update(1, dto);

      expect(repository.findOne).toHaveBeenCalledWith(1);
      expect(repository.update).toHaveBeenCalledWith(1, dto);

      expect(result).toEqual([
        {
          ...movie[0],
          TITLE: 'Updated Interstellar',
        },
      ]);
    });

    it('should throw NotFoundException when updating missing movie', async () => {
      repository.findOne.mockResolvedValue([]);

      await expect(
        service.update(999, { title: 'Test' }),
      ).rejects.toThrow(NotFoundException);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove an existing movie', async () => {
      repository.findOne.mockResolvedValue(movieDetail);
      repository.remove.mockResolvedValue(undefined);

      const result = await service.remove(1);

      expect(repository.findOne).toHaveBeenCalledWith(1);
      expect(repository.remove).toHaveBeenCalledWith(1);

      expect(result).toEqual({
        message: 'Movie 1 deleted successfully',
      });
    });

    it('should throw NotFoundException when deleting missing movie', async () => {
      repository.findOne.mockResolvedValue(movieDetail);

      await expect(service.remove(999)).rejects.toThrow(
        NotFoundException,
      );

      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
