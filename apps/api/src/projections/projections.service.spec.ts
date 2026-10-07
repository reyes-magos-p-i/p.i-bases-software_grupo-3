import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectionsService } from './projections.service';
import type { ProjectionsRepository } from './projections.repository';
import type { CreateProjectionDto } from './dto/create-projection.dto';

describe('ProjectionsService', () => {
  const repository = {
    getCatalogs: jest.fn(),
    getScheduledMovies: jest.fn(),
    listProjections: jest.fn(),
    findProjection: jest.fn(),
    findAvailableMovies: jest.fn(),
    findAvailableMovieRunningTime: jest.fn(),
    createProjections: jest.fn(),
    updateProjection: jest.fn(),
  };
  const service = new ProjectionsService(
    repository as unknown as ProjectionsRepository,
  );
  const request = (overrides: Partial<CreateProjectionDto> = {}): CreateProjectionDto => ({
    movieId: 3,
    theaterId: 7,
    startDate: '2099-07-21',
    startTime: '21:00',
    endTime: '01:55',
    cleaningMinutes: 30,
    advertisementMinutes: 15,
    price: 4500,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findAvailableMovieRunningTime.mockResolvedValue(190);
    repository.createProjections.mockResolvedValue({ projections: [] });
  });

  it('delegates the scheduling options and the movie search', async () => {
    repository.getCatalogs.mockResolvedValue({ cinemas: [], theaters: [] });
    repository.findAvailableMovies.mockResolvedValue([]);
    await expect(service.getSchedulingOptions()).resolves.toEqual({
      cinemas: [],
      theaters: [],
      defaultTicketPrice: 3500,
    });
    await service.findAvailableMovies({ branchId: 2 });
    await service.findAvailableMovies({ branchId: 2, search: 'spider' });
    expect(repository.findAvailableMovies).toHaveBeenNthCalledWith(1, 2, '');
    expect(repository.findAvailableMovies).toHaveBeenNthCalledWith(2, 2, 'spider');
    expect(repository.getCatalogs).toHaveBeenCalledWith(true);
  });

  it('combines all theaters and scheduled movies for the list filters', async () => {
    repository.getCatalogs.mockResolvedValue({ cinemas: [], theaters: [] });
    repository.getScheduledMovies.mockResolvedValue([{ movieId: 3, title: 'Odyssey' }]);
    await expect(service.getFilterOptions()).resolves.toEqual({
      cinemas: [],
      theaters: [],
      movies: [{ movieId: 3, title: 'Odyssey' }],
    });
    expect(repository.getCatalogs).toHaveBeenCalledWith(false);
  });

  it('adds the page information to the list', async () => {
    repository.listProjections.mockResolvedValue({ items: [{ movieFunctionId: 1 }], total: 21 });
    await expect(service.list({ page: 2, pageSize: 10, status: 'ACTIVE' })).resolves.toEqual({
      items: [{ movieFunctionId: 1 }],
      total: 21,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
    repository.listProjections.mockResolvedValue({ items: [], total: 0 });
    await expect(service.list({ page: 1, pageSize: 25 })).resolves.toMatchObject({ totalPages: 0 });
  });

  it('returns the detail or reports a projection that no longer exists', async () => {
    repository.findProjection.mockResolvedValueOnce({ movieFunctionId: 100 });
    await expect(service.findOne(100)).resolves.toEqual({ movieFunctionId: 100 });
    repository.findProjection.mockResolvedValueOnce(null);
    await expect(service.findOne(101)).rejects.toThrow(
      new NotFoundException('Esta proyección ya no está disponible.'),
    );
  });

  it('creates one active projection per day of the range', async () => {
    await service.create(request({ endDate: '2099-07-22' }), 21);
    expect(repository.findAvailableMovieRunningTime).toHaveBeenCalledWith(7, 3);
    expect(repository.createProjections).toHaveBeenCalledWith(
      {
        movieId: 3,
        theaterId: 7,
        price: 4500,
        status: 'ACTIVE',
        cleaningMinutes: 30,
        advertisementMinutes: 15,
        slots: [
          { screeningDate: '2099-07-21', startTime: '2099-07-21T21:00', endTime: '2099-07-22T01:55' },
          { screeningDate: '2099-07-22', startTime: '2099-07-22T21:00', endTime: '2099-07-23T01:55' },
        ],
      },
      21,
    );
  });

  it('uses the default ticket price when none is given', async () => {
    await service.create(request({ price: undefined }), 21);
    expect(repository.createProjections).toHaveBeenCalledWith(
      expect.objectContaining({ price: 3500 }),
      21,
    );
  });

  it('keeps an inactive status and accepts an end time equal to the minimum', async () => {
    await service.create(request({ endTime: '00:55', status: 'INACTIVE' }), 21);
    expect(repository.createProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INACTIVE',
        slots: [expect.objectContaining({ endTime: '2099-07-22T00:55' })],
      }),
      21,
    );
  });

  it.each([
    [{ endDate: '2099-07-20' }, 'La fecha final no puede ser anterior a la fecha inicial.'],
    [{ endDate: '2099-08-21' }, 'El rango de fechas no puede superar 31 días.'],
    [{ startDate: '2000-01-01' }, 'La fecha y hora de la proyección no puede estar en el pasado.'],
    [
      { endTime: '00:54' },
      'La hora de fin debe ser igual o posterior a las 00:55 (anuncios + película + limpieza = 235 minutos).',
    ],
  ])('rejects invalid schedules %#', async (overrides, message) => {
    await expect(service.create(request(overrides), 21)).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  it('reports a movie or theater that is no longer available', async () => {
    repository.findAvailableMovieRunningTime.mockResolvedValue(null);
    await expect(service.create(request(), 21)).rejects.toThrow(
      new ConflictException('La sala/película seleccionada ya no está disponible.'),
    );
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  describe('update', () => {
    const changes = {
      movieId: 3,
      theaterId: 7,
      startDate: '2099-07-21',
      startTime: '21:00',
      endTime: '01:55',
      cleaningMinutes: 30,
      advertisementMinutes: 15,
    };

    it('reschedules one date and returns the updated detail', async () => {
      repository.findProjection.mockResolvedValue({ movieFunctionId: 100 });
      await expect(
        service.update(100, { ...changes, price: 4200, status: 'INACTIVE' }, 21),
      ).resolves.toEqual({ movieFunctionId: 100 });
      expect(repository.updateProjection).toHaveBeenCalledWith(
        100,
        {
          movieId: 3,
          theaterId: 7,
          price: 4200,
          status: 'INACTIVE',
          cleaningMinutes: 30,
          advertisementMinutes: 15,
          slot: {
            screeningDate: '2099-07-21',
            startTime: '2099-07-21T21:00',
            endTime: '2099-07-22T01:55',
          },
        },
        21,
      );
    });

    it('keeps the current price and status when they are omitted', async () => {
      repository.findProjection.mockResolvedValue({ movieFunctionId: 100 });
      await service.update(100, changes, 21);
      expect(repository.updateProjection.mock.calls[0][1]).toMatchObject({
        price: undefined,
        status: undefined,
      });
    });

    it.each([
      [{ startDate: '2000-01-01' }, new BadRequestException('La fecha y hora de la proyección no puede estar en el pasado.')],
      [{ endTime: '00:54' }, expect.any(BadRequestException)],
    ])('applies the creation rules %#', async (override, error) => {
      await expect(service.update(100, { ...changes, ...override }, 21)).rejects.toEqual(error);
      expect(repository.updateProjection).not.toHaveBeenCalled();
    });

    it('reports an unavailable selection with the modification message', async () => {
      repository.findAvailableMovieRunningTime.mockResolvedValue(null);
      await expect(service.update(100, changes, 21)).rejects.toThrow(
        new ConflictException('El elemento seleccionado ya no está disponible.'),
      );
    });
  });
});
