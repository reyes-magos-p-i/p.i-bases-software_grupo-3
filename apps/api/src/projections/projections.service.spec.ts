import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProjectionsService } from './projections.service';
import type { ProjectionsRepository } from './projections.repository';
import type { CreateProjectionDto } from './dto/create-projection.dto';

describe('ProjectionsService', () => {
  const repository = {
    getSchedulingOptions: jest.fn(),
    findAvailableMovies: jest.fn(),
    findAvailableMovieRunningTime: jest.fn(),
    createProjections: jest.fn(),
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
    repository.getSchedulingOptions.mockResolvedValue({ cinemas: [], theaters: [] });
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
});
