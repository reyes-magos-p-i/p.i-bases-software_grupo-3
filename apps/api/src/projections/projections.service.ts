import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { AvailableMoviesQueryDto } from './dto/available-movies-query.dto';
import type { CreateProjectionDto } from './dto/create-projection.dto';
import { DEFAULT_TICKET_PRICE } from './projection-defaults';
import { PROJECTION_MESSAGES } from './projection-messages';
import {
  addMinutes,
  buildSlots,
  costaRicaNow,
  formatLocal,
  MAX_SCHEDULE_DAYS,
  scheduleDays,
  scheduledDurationMinutes,
} from './projection-schedule';
import { ProjectionsRepository } from './projections.repository';
import type {
  CreatedProjections,
  ProjectionSchedulingOptions,
} from './types/projection.types';

@Injectable()
export class ProjectionsService {
  constructor(private readonly repository: ProjectionsRepository) {}

  async getSchedulingOptions(): Promise<ProjectionSchedulingOptions> {
    return {
      ...(await this.repository.getSchedulingOptions()),
      defaultTicketPrice: DEFAULT_TICKET_PRICE,
    };
  }

  findAvailableMovies(query: AvailableMoviesQueryDto) {
    return this.repository.findAvailableMovies(query.branchId, query.search ?? '');
  }

  async create(
    data: CreateProjectionDto,
    actorId: number,
  ): Promise<CreatedProjections> {
    const endDate = data.endDate ?? data.startDate;
    if (endDate < data.startDate)
      throw new BadRequestException(PROJECTION_MESSAGES.invalidRange);
    const days = scheduleDays(data.startDate, endDate);
    if (days.length > MAX_SCHEDULE_DAYS)
      throw new BadRequestException(
        `El rango de fechas no puede superar ${MAX_SCHEDULE_DAYS} días.`,
      );
    const firstStart = `${data.startDate}T${data.startTime}`;
    if (firstStart <= costaRicaNow())
      throw new BadRequestException(PROJECTION_MESSAGES.pastSchedule);

    const runningTime = await this.repository.findAvailableMovieRunningTime(
      data.theaterId,
      data.movieId,
    );
    if (runningTime === null)
      throw new ConflictException(PROJECTION_MESSAGES.unavailable);

    const minimum =
      data.advertisementMinutes + runningTime + data.cleaningMinutes;
    const duration = scheduledDurationMinutes(data.startTime, data.endTime);
    if (duration < minimum)
      throw new BadRequestException(
        `La hora de fin debe ser igual o posterior a las ${formatLocal(addMinutes(firstStart, minimum)).slice(-5)} (anuncios + película + limpieza = ${minimum} minutos).`,
      );

    return this.repository.createProjections(
      {
        movieId: data.movieId,
        theaterId: data.theaterId,
        price: data.price ?? DEFAULT_TICKET_PRICE,
        status: data.status ?? 'ACTIVE',
        cleaningMinutes: data.cleaningMinutes,
        advertisementMinutes: data.advertisementMinutes,
        slots: buildSlots(days, data.startTime, duration),
      },
      actorId,
    );
  }
}
