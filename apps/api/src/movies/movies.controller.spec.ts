import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';

describe('MoviesController', () => {
  let controller: MoviesController;

  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findClassifications: jest.fn(),
    findGenres: jest.fn(),
    findLanguages: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new MoviesController(
      service as unknown as MoviesService,
    );
  });

  it('creates a movie', async () => {
    const dto: CreateMovieDto = {
      title: 'Interstellar',
      synopsis: 'Space adventure',
      runningTime: 169,
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1],
      genreIds: [2],
      posterImage: '/uploads/posters/interstellar.jpg',
    };

    const result = { id: 24 };
    service.create.mockResolvedValue(result);

    expect(await controller.create(dto)).toEqual(result);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('returns all movies', async () => {
    const result = [{ id: 24, title: 'Interstellar' }];
    service.findAll.mockResolvedValue(result);

    expect(await controller.findAll()).toEqual(result);
    expect(service.findAll).toHaveBeenCalledWith();
  });

  it('returns classifications', async () => {
    const result = [{ id: 1, name: 'TP' }];
    service.findClassifications.mockResolvedValue(result);

    expect(await controller.findClassifications()).toEqual(result);
    expect(service.findClassifications).toHaveBeenCalledWith();
  });

  it('returns genres', async () => {
    const result = [{ id: 2, name: 'Science fiction' }];
    service.findGenres.mockResolvedValue(result);

    expect(await controller.findGenres()).toEqual(result);
    expect(service.findGenres).toHaveBeenCalledWith();
  });

  it('returns languages', async () => {
    const result = [{ id: 1, name: 'English' }];
    service.findLanguages.mockResolvedValue(result);

    expect(await controller.findLanguages()).toEqual(result);
    expect(service.findLanguages).toHaveBeenCalledWith();
  });

  it('returns the requested movie', async () => {
    const result = { id: 24, title: 'Interstellar' };
    service.findOne.mockResolvedValue(result);

    expect(await controller.findOne(24)).toEqual(result);
    expect(service.findOne).toHaveBeenCalledWith(24);
  });

  it('updates the requested movie', async () => {
    const dto: UpdateMovieDto = {
      title: 'Updated title',
    };

    const result = { id: 24, title: 'Updated title' };
    service.update.mockResolvedValue(result);

    expect(await controller.update(24, dto)).toEqual(result);
    expect(service.update).toHaveBeenCalledWith(24, dto);
  });

  it('removes the requested movie', async () => {
    service.remove.mockResolvedValue(undefined);

    expect(await controller.remove(24)).toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(24);
  });
});
