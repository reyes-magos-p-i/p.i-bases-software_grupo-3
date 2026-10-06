import { Test, TestingModule } from '@nestjs/testing';

import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';

describe('MoviesController', () => {
  let controller: MoviesController;
  let service: jest.Mocked<MoviesService>;

  const movie = [
    {
      MOVIE_ID: 1,
      TITLE: 'Interstellar',
    },
  ];

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
    service.findAll.mockResolvedValue(movie);

    const result = await controller.findAll();

    expect(result).toEqual(movie);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('should return one movie', async () => {
    service.findOne.mockResolvedValue(movie);

    const result = await controller.findOne(1);

    expect(result).toEqual(movie);
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

  it('should update a movie', async () => {
    const dto = {
      title: 'Updated title',
    };

    service.update.mockResolvedValue(movie);

    const result = await controller.update(1, dto);

    expect(result).toEqual(movie);
    expect(service.update).toHaveBeenCalledWith(1, dto);
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
