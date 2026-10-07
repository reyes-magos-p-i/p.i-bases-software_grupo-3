import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { MoviesService } from './movies.service';
import { MoviesRepository } from './movies.repository';

describe('MoviesService', () => {
  let service: MoviesService;
  let repository: jest.Mocked<MoviesRepository>;

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

      expect(result).toEqual(movieAll);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a movie', async () => {
      repository.findOne.mockResolvedValue(movieDetail);

      const result = await service.findOne(1);

      expect(result).toEqual(movieDetail);
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

  describe('catalogs', () => {
  it.each([
    'findClassifications',
    'findGenres',
    'findLanguages',
  ] as const)('%s delegates to the repository', async (method) => {
    const options = [{ id: 1, name: 'Option' }];
    repository[method].mockResolvedValueOnce(options);

    expect(await service[method]()).toEqual(options);
    expect(repository[method]).toHaveBeenCalledTimes(1);
  });
});

  describe('update', () => {
    it('passes the ID and changes to the repository', async () => {
      const dto = { title: 'Updated title' };
      repository.update.mockResolvedValueOnce(undefined);

      await service.update(24, dto);

      expect(repository.update).toHaveBeenCalledWith(24, dto);
    });

    it('propagates repository errors', async () => {
      const failure = new NotFoundException('Movie not found');
      repository.update.mockRejectedValueOnce(failure);

      await expect(service.update(999, {})).rejects.toThrow(failure);
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
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(
        NotFoundException,
      );

      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

});
