import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { MoviesService } from './movies.service';
import { MoviesRepository } from './movies.repository';

describe('MoviesService', () => {
  let service: MoviesService;
  let repository: jest.Mocked<MoviesRepository>;

  const movieList = [
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
    synopsis: 'A team travels through space.',
    runningTime: 169,
    releaseYear: 2014,
    classification: { id: 1, name: 'TP' },
    languages: [{ id: 1, name: 'English' }],
    genres: [{ id: 3, name: 'Adventure' }],
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MoviesService,
        {
          provide: MoviesRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            findClassifications: jest.fn(),
            findGenres: jest.fn(),
            findLanguages: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(MoviesService);
    repository = module.get(MoviesRepository);
  });

  it('returns all movies', async () => {
    repository.findAll.mockResolvedValue(movieList);

    expect(await service.findAll()).toEqual(movieList);
    expect(repository.findAll).toHaveBeenCalledTimes(1);
  });

  it('returns the selected movie', async () => {
    repository.findOne.mockResolvedValue(movieDetail);

    expect(await service.findOne(24)).toEqual(movieDetail);
    expect(repository.findOne).toHaveBeenCalledWith(24);
  });

  it('throws when the selected movie does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a movie', async () => {
    const dto = {
      title: 'Interstellar',
      synopsis: 'A team travels through space.',
      posterImage: 'default-poster',
      runningTime: 169,
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1],
      genreIds: [3],
    };

    repository.create.mockResolvedValue(24);

    expect(await service.create(dto)).toBe(24);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('returns classifications', async () => {
    const options = [{ id: 1, name: 'TP' }];
    repository.findClassifications.mockResolvedValue(options);

    expect(await service.findClassifications()).toEqual(options);
    expect(repository.findClassifications).toHaveBeenCalledTimes(1);
  });

  it('returns genres', async () => {
    const options = [{ id: 3, name: 'Adventure' }];
    repository.findGenres.mockResolvedValue(options);

    expect(await service.findGenres()).toEqual(options);
    expect(repository.findGenres).toHaveBeenCalledTimes(1);
  });

  it('returns languages', async () => {
    const options = [{ id: 1, name: 'English' }];
    repository.findLanguages.mockResolvedValue(options);

    expect(await service.findLanguages()).toEqual(options);
    expect(repository.findLanguages).toHaveBeenCalledTimes(1);
  });

  it('deletes an existing movie', async () => {
    repository.findOne.mockResolvedValue(movieDetail);
    repository.remove.mockResolvedValue(undefined);

    expect(await service.remove(24)).toEqual({
      message: 'Movie 24 deleted successfully',
    });

    expect(repository.findOne).toHaveBeenCalledWith(24);
    expect(repository.remove).toHaveBeenCalledWith(24);
  });

  it('does not delete a movie that does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(
      NotFoundException,
    );

    expect(repository.remove).not.toHaveBeenCalled();
  });
});
