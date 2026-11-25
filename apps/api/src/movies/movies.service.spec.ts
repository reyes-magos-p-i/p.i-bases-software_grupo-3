import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
    posterImage: null,
    releaseDate: null as string | null,
    presaleStart: null as string | null,
    classification: { id: 1, name: 'TP' },
    languages: [{ id: 1, name: 'English' }],
    genres: [{ id: 3, name: 'Adventure' }],
    branches: [{ id: 1, name: 'Cinetadel Multiplaza del Este' }],
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
            findBranches: jest.fn(),
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

  describe('release and presale dates', () => {
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

    it('creates a movie whose presale starts before the release', async () => {
      repository.create.mockResolvedValue(24);

      await service.create({
        ...dto,
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });

      expect(repository.create).toHaveBeenCalled();
    });

    it.each([
      [
        { presaleStart: '2026-11-15' },
        'Indica la fecha de estreno para programar la preventa.',
      ],
      [
        { releaseDate: '2026-12-04', presaleStart: '2026-12-04' },
        'La preventa debe empezar antes de la fecha de estreno.',
      ],
      [
        { releaseDate: '2026-12-04', presaleStart: '2026-12-10' },
        'La preventa debe empezar antes de la fecha de estreno.',
      ],
    ])('rejects the dates %o on create', async (dates, message) => {
      await expect(service.create({ ...dto, ...dates })).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('checks an update against the dates already stored', async () => {
      repository.findOne.mockResolvedValue({
        ...movieDetail,
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });

      await expect(
        service.update(24, { presaleStart: '2026-12-10' }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.update(24, { releaseDate: null })).rejects.toThrow(
        'Indica la fecha de estreno para programar la preventa.',
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('lets an update clear both dates together', async () => {
      repository.findOne.mockResolvedValue({
        ...movieDetail,
        releaseDate: '2026-12-04',
        presaleStart: '2026-11-15',
      });

      await service.update(24, { releaseDate: null, presaleStart: null });

      expect(repository.update).toHaveBeenCalledWith(24, {
        releaseDate: null,
        presaleStart: null,
      });
    });
  });

  describe('branches', () => {
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

    beforeEach(() => {
      repository.findBranches.mockResolvedValue([
        { id: 1, name: 'Cinetadel Multiplaza del Este' },
        { id: 27, name: 'Cinetadel Multiplaza Escazú' },
      ]);
    });

    it('creates a movie available in active branches', async () => {
      repository.create.mockResolvedValue(24);

      await service.create({ ...dto, branchIds: [1, 27] });

      expect(repository.create).toHaveBeenCalledWith({ ...dto, branchIds: [1, 27] });
    });

    it('skips the branch check when no branches are sent', async () => {
      await service.create(dto);
      await service.create({ ...dto, branchIds: [] });

      expect(repository.findBranches).not.toHaveBeenCalled();
    });

    it('rejects inactive or unknown branches on create and update', async () => {
      repository.findOne.mockResolvedValue(movieDetail);
      const error = new BadRequestException('Selecciona únicamente sucursales activas.');

      await expect(service.create({ ...dto, branchIds: [1, 99] })).rejects.toThrow(error);
      await expect(service.update(24, { branchIds: [99] })).rejects.toThrow(error);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('updates the branches of a movie', async () => {
      repository.findOne.mockResolvedValue(movieDetail);

      await service.update(24, { branchIds: [27] });

      expect(repository.update).toHaveBeenCalledWith(24, { branchIds: [27] });
    });

    it('returns the active branches', async () => {
      expect(await service.findBranches()).toHaveLength(2);
    });
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
