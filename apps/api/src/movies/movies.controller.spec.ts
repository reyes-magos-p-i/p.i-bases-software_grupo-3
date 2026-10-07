import { Test, TestingModule } from '@nestjs/testing';

import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';

describe('MoviesController', () => {
  let controller: MoviesController;
  let service: jest.Mocked<MoviesService>;

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
    const serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoviesController],
      providers: [
        {
          provide: MoviesService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get(MoviesController);
    service = module.get(MoviesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all movies', async () => {
    service.findAll.mockResolvedValue(movieAll);

    const result = await controller.findAll();

    expect(result).toEqual(movieAll);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('should return one movie', async () => {
    service.findOne.mockResolvedValue(movieDetail);

    const result = await controller.findOne(1);

    expect(result).toEqual(movieDetail);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

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

    service.create.mockResolvedValue(10);

    const result = await controller.create(dto);

    expect(result).toEqual(10);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  describe('catalogs', () => {
  it.each([
    'findClassifications',
    'findGenres',
    'findLanguages',
  ] as const)('%s returns service options', async (method) => {
    const options = [{ id: 1, name: 'Option' }];
    service[method].mockResolvedValueOnce(options);

    expect(await controller[method]()).toEqual(options);
    expect(service[method]).toHaveBeenCalledTimes(1);
  });
});

it('passes movie updates to the service', async () => {
  const updatedMovie = {
  id: 24,
  title: 'Updated title',
  synopsis: 'A journey through space.',
  runningTime: 169,
  releaseYear: 2014,
  classification: { id: 1, name: 'TP' },
  languages: [{ id: 1, name: 'English' }],
  genres: [{ id: 3, name: 'Science fiction' }],
};
  const dto = { title: 'Updated title' };
  service.update.mockResolvedValueOnce(updatedMovie);

  await controller.update(24, dto);

  expect(service.update).toHaveBeenCalledWith(24, dto);
});
  it('should delete a movie', async () => {
    service.remove.mockResolvedValue({
      message: 'Movie 1 deleted successfully',
    });

    const result = await controller.remove(1);

    expect(result).toEqual({
      message: 'Movie 1 deleted successfully',
    });

    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
