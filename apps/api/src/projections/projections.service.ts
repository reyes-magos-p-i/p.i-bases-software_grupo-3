import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import type { ListProjectionsQueryDto } from './dto/list-projections-query.dto';
import type { UpdateProjectionDto } from './dto/update-projection.dto';
import type {
  CreatedProjections,
  ProjectionDetail,
  ProjectionFilterOptions,
  ProjectionList,
  ProjectionSchedulingOptions,
} from './types/projection.types';

@Injectable()
export class ProjectionsService {
  constructor(private readonly repository: ProjectionsRepository) {}

  async getSchedulingOptions(): Promise<ProjectionSchedulingOptions> {
    return {
      ...(await this.repository.getCatalogs(true)),
      defaultTicketPrice: DEFAULT_TICKET_PRICE,
    };
  }

  async getFilterOptions(): Promise<ProjectionFilterOptions> {
    const [catalogs, movies] = await Promise.all([
      this.repository.getCatalogs(false),
      this.repository.getScheduledMovies(),
    ]);
    return { ...catalogs, movies };
  }

  async list(query: ListProjectionsQueryDto): Promise<ProjectionList> {
    const { items, total } = await this.repository.listProjections(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOne(id: number): Promise<ProjectionDetail> {
    const projection = await this.repository.findProjection(id);
    if (!projection) throw new NotFoundException(PROJECTION_MESSAGES.notFound);
    return projection;
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
    const duration = await this.scheduledDuration(data, PROJECTION_MESSAGES.unavailable);
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

  /** Reschedules one projection; omitted price or status keep their current value. */
  async update(
    id: number,
    data: UpdateProjectionDto,
    actorId: number,
  ): Promise<ProjectionDetail> {
    const duration = await this.scheduledDuration(
      data,
      PROJECTION_MESSAGES.selectionUnavailable,
    );
    await this.repository.updateProjection(
      id,
      {
        movieId: data.movieId,
        theaterId: data.theaterId,
        price: data.price,
        status: data.status,
        cleaningMinutes: data.cleaningMinutes,
        advertisementMinutes: data.advertisementMinutes,
        slot: buildSlots([data.startDate], data.startTime, duration)[0]!,
      },
      actorId,
    );
    return this.findOne(id);
  }

  // Shared scheduling rules: no past start, available movie and theater, and an
  // end time that leaves room for ads + movie + cleaning. Returns the duration.
  private async scheduledDuration(
    data: ScheduleRequest,
    unavailableMessage: string,
  ): Promise<number> {
    const firstStart = `${data.startDate}T${data.startTime}`;
    if (firstStart <= costaRicaNow())
      throw new BadRequestException(PROJECTION_MESSAGES.pastSchedule);

    const runningTime = await this.repository.findAvailableMovieRunningTime(
      data.theaterId,
      data.movieId,
    );
    if (runningTime === null) throw new ConflictException(unavailableMessage);

    const minimum =
      data.advertisementMinutes + runningTime + data.cleaningMinutes;
    const duration = scheduledDurationMinutes(data.startTime, data.endTime);
    if (duration < minimum)
      throw new BadRequestException(
        `La hora de fin debe ser igual o posterior a las ${formatLocal(addMinutes(firstStart, minimum)).slice(-5)} (anuncios + película + limpieza = ${minimum} minutos).`,
      );
    return duration;
  }
}

type ScheduleRequest = Pick<
  CreateProjectionDto,
  | 'movieId'
  | 'theaterId'
  | 'startDate'
  | 'startTime'
  | 'endTime'
  | 'cleaningMinutes'
  | 'advertisementMinutes'
>;
