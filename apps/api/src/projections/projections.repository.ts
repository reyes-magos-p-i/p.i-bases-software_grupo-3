import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { likePattern } from '../users/user-search.util';
import { PROJECTION_MESSAGES } from './projection-messages';
import { formatLocal, type ProjectionSlot } from './projection-schedule';
import type { ListProjectionsQueryDto } from './dto/list-projections-query.dto';
import type {
  AvailableMovie,
  CreatedProjection,
  CreatedProjections,
  ListedProjection,
  NewProjections,
  ProjectionCatalogs,
  ProjectionChanges,
  ProjectionDetail,
  ProjectionFilterOptions,
} from './types/projection.types';

const LOCAL_FORMAT = `'YYYY-MM-DD"T"HH24:MI'`;
const TRANSACTION = {
  outFormat: oracle.OUT_FORMAT_OBJECT,
  autoCommit: false,
} as const;
const MOVIE_SEARCH_LIMIT = 10;
const MAX_REPORTED_CONFLICTS = 5;
const PROJECTION_COLUMNS = `mf.MOVIE_FUNCTION_ID AS "movieFunctionId", m.MOVIE_ID AS "movieId",
       m.TITLE AS "movieTitle", t.BRANCH_ID AS "branchId", c.NAME AS "branchName",
       mf.THEATER_ID AS "theaterId", TO_CHAR(mf.START_TIME, ${LOCAL_FORMAT}) AS "startTime",
       TO_CHAR(mf.END_TIME, ${LOCAL_FORMAT}) AS "endTime", mf.STATUS AS "status", mf.PRICE AS "price"`;
const PROJECTION_SOURCE = `FROM MOVIE_FUNCTIONS mf
  JOIN MOVIES m ON m.MOVIE_ID = mf.MOVIE_ID
  JOIN THEATERS t ON t.THEATER_ID = mf.THEATER_ID
  JOIN CINEMAS c ON c.BRANCH_ID = t.BRANCH_ID`;

type Binds = Exclude<oracle.BindParameters, unknown[]>;

/** WHERE clause for the combinable list filters; every value travels as a bind. */
function buildProjectionFilters(query: ListProjectionsQueryDto, binds: Binds): string {
  const conditions = ['1 = 1'];
  const add = (condition: string, name: string, value: string | number | undefined) => {
    if (value === undefined) return;
    conditions.push(condition);
    binds[name] = value;
  };
  add('mf.STATUS = :status', 'status', query.status);
  add('t.BRANCH_ID = :branchId', 'branchId', query.branchId);
  add('mf.THEATER_ID = :theaterId', 'theaterId', query.theaterId);
  add('mf.MOVIE_ID = :movieId', 'movieId', query.movieId);
  add(`mf.SCREENING_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD')`, 'dateFrom', query.dateFrom);
  add(`mf.SCREENING_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD')`, 'dateTo', query.dateTo);
  add(`TO_CHAR(mf.START_TIME, 'HH24:MI') >= :timeFrom`, 'timeFrom', query.timeFrom);
  add(`TO_CHAR(mf.START_TIME, 'HH24:MI') <= :timeTo`, 'timeTo', query.timeTo);
  const search = query.search?.trim();
  if (search)
    add(
      String.raw`(LOWER(m.TITLE) LIKE :search ESCAPE '\' OR TO_CHAR(mf.MOVIE_FUNCTION_ID) LIKE :search ESCAPE '\')`,
      'search',
      likePattern(search),
    );
  return conditions.join(' AND ');
}

@Injectable()
export class ProjectionsRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Branches and theaters; scheduling only offers active theaters, filters show all. */
  async getCatalogs(onlyActiveTheaters: boolean): Promise<ProjectionCatalogs> {
    const [cinemas, theaters] = await Promise.all([
      this.db.query<ProjectionCatalogs['cinemas'][number]>(
        'SELECT BRANCH_ID AS "branchId", NAME AS "name" FROM CINEMAS ORDER BY NAME',
      ),
      this.db.query<ProjectionCatalogs['theaters'][number]>(
        `SELECT THEATER_ID AS "theaterId", BRANCH_ID AS "branchId", NUMBER_SEATS AS "numberOfSeats"
           FROM THEATERS ${onlyActiveTheaters ? 'WHERE IS_ACTIVE = 1' : ''}
          ORDER BY THEATER_ID`,
      ),
    ]);
    return { cinemas: cinemas.rows ?? [], theaters: theaters.rows ?? [] };
  }

  /** Movies that have at least one projection, for the list filter. */
  async getScheduledMovies(): Promise<ProjectionFilterOptions['movies']> {
    const result = await this.db.query<ProjectionFilterOptions['movies'][number]>(
      `SELECT m.MOVIE_ID AS "movieId", m.TITLE AS "title"
         FROM MOVIES m
        WHERE EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS mf WHERE mf.MOVIE_ID = m.MOVIE_ID)
        ORDER BY m.TITLE`,
    );
    return result.rows ?? [];
  }

  async listProjections(
    query: ListProjectionsQueryDto,
  ): Promise<{ items: ListedProjection[]; total: number }> {
    const binds: Binds = {};
    const where = buildProjectionFilters(query, binds);
    const [count, page] = await Promise.all([
      this.db.query<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL ${PROJECTION_SOURCE} WHERE ${where}`,
        binds,
      ),
      this.db.query<ListedProjection>(
        `SELECT ${PROJECTION_COLUMNS} ${PROJECTION_SOURCE} WHERE ${where}
          ORDER BY mf.START_TIME, mf.MOVIE_FUNCTION_ID
         OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
        {
          ...binds,
          offset: (query.page - 1) * query.pageSize,
          pageSize: query.pageSize,
        },
      ),
    ]);
    return { items: page.rows ?? [], total: count.rows?.[0]?.TOTAL ?? 0 };
  }

  async findProjection(id: number): Promise<ProjectionDetail | null> {
    const activityMinutes = (type: string) =>
      `(SELECT MAX(a.DURATION_MINUTES) FROM MOVIE_FUNCTIONS_ACTIVITIES mfa
          JOIN ACTIVITIES a ON a.ACTIVITY_ID = mfa.ACTIVITY_ID
         WHERE mfa.MOVIE_FUNCTION_ID = mf.MOVIE_FUNCTION_ID AND a.TYPE = '${type}')`;
    const result = await this.db.query<ProjectionDetail>(
      `SELECT ${PROJECTION_COLUMNS},
              m.RUNNING_TIME AS "runningTime", m.POSTER_IMAGE AS "posterImage",
              TO_CHAR(mf.CREATED_AT AT TIME ZONE 'America/Costa_Rica', ${LOCAL_FORMAT}) AS "createdAt",
              ${activityMinutes('CLEANING')} AS "cleaningMinutes",
              ${activityMinutes('ADVERTISEMENT')} AS "advertisementMinutes"
         ${PROJECTION_SOURCE}
        WHERE mf.MOVIE_FUNCTION_ID = :id`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    return result.rows?.[0] ?? null;
  }

  async findAvailableMovies(
    branchId: number,
    search: string,
  ): Promise<AvailableMovie[]> {
    const result = await this.db.query<AvailableMovie>(
      String.raw`SELECT m.MOVIE_ID AS "movieId", m.TITLE AS "title",
              m.RUNNING_TIME AS "runningTime", m.POSTER_IMAGE AS "posterImage"
         FROM MOVIES m
         JOIN CINEMA_MOVIES cm ON cm.MOVIE_ID = m.MOVIE_ID
        WHERE cm.BRANCH_ID = :branchId AND cm.IS_AVAILABLE = 1
          AND LOWER(m.TITLE) LIKE :search ESCAPE '\'
        ORDER BY m.TITLE
        FETCH FIRST ${MOVIE_SEARCH_LIMIT} ROWS ONLY`,
      {
        branchId: { val: branchId, type: oracle.NUMBER },
        search: { val: likePattern(search.trim()), type: oracle.STRING },
      },
    );
    return result.rows ?? [];
  }

  /** Running time of the movie when both it and the theater are available. */
  async findAvailableMovieRunningTime(
    theaterId: number,
    movieId: number,
  ): Promise<number | null> {
    const result = await this.db.query<{ RUNNING_TIME: number }>(
      `SELECT m.RUNNING_TIME
         FROM THEATERS t
         JOIN CINEMA_MOVIES cm ON cm.BRANCH_ID = t.BRANCH_ID AND cm.IS_AVAILABLE = 1
         JOIN MOVIES m ON m.MOVIE_ID = cm.MOVIE_ID
        WHERE t.THEATER_ID = :theaterId AND t.IS_ACTIVE = 1 AND m.MOVIE_ID = :movieId`,
      {
        theaterId: { val: theaterId, type: oracle.NUMBER },
        movieId: { val: movieId, type: oracle.NUMBER },
      },
    );
    return result.rows?.[0]?.RUNNING_TIME ?? null;
  }

  async createProjections(
    data: NewProjections,
    actorId: number,
  ): Promise<CreatedProjections> {
    const projections = await this.scheduling(async (connection) => {
      await this.lockAvailableTheater(
        connection,
        data.theaterId,
        data.movieId,
        PROJECTION_MESSAGES.unavailable,
      );
      await this.rejectScheduleConflicts(connection, data.theaterId, data.slots);
      const activityIds = await this.ensureActivities(connection, data);
      const created: CreatedProjection[] = [];
      for (const slot of data.slots) {
        const movieFunctionId = await this.insertProjection(connection, data, slot, actorId);
        await this.linkActivities(connection, movieFunctionId, activityIds, actorId);
        created.push({ movieFunctionId, startTime: slot.startTime, endTime: slot.endTime });
      }
      return created;
    });
    return { status: data.status, price: data.price, projections };
  }

  async updateProjection(
    id: number,
    data: ProjectionChanges,
    actorId: number,
  ): Promise<void> {
    await this.scheduling(async (connection) => {
      const current = await connection.execute<{ STATUS: string }>(
        'SELECT STATUS FROM MOVIE_FUNCTIONS WHERE MOVIE_FUNCTION_ID = :id FOR UPDATE',
        { id: { val: id, type: oracle.NUMBER } },
        TRANSACTION,
      );
      const status = current.rows?.[0]?.STATUS;
      if (status === undefined) throw new NotFoundException(PROJECTION_MESSAGES.notFound);
      if (status !== 'ACTIVE' && status !== 'INACTIVE')
        throw new ConflictException(PROJECTION_MESSAGES.notEditable);
      await this.lockAvailableTheater(
        connection,
        data.theaterId,
        data.movieId,
        PROJECTION_MESSAGES.selectionUnavailable,
      );
      await this.rejectScheduleConflicts(connection, data.theaterId, [data.slot], id);
      const activityIds = await this.ensureActivities(connection, data);
      await connection.execute(
        `UPDATE MOVIE_FUNCTIONS
            SET MOVIE_ID = :movieId, THEATER_ID = :theaterId,
                START_TIME = TO_TIMESTAMP(:startTime, ${LOCAL_FORMAT}),
                END_TIME = TO_TIMESTAMP(:endTime, ${LOCAL_FORMAT}),
                SCREENING_DATE = TO_DATE(:screeningDate, 'YYYY-MM-DD'),
                PRICE = COALESCE(:price, PRICE), STATUS = COALESCE(:status, STATUS)
          WHERE MOVIE_FUNCTION_ID = :id`,
        {
          id,
          movieId: data.movieId,
          theaterId: data.theaterId,
          startTime: data.slot.startTime,
          endTime: data.slot.endTime,
          screeningDate: data.slot.screeningDate,
          price: { val: data.price ?? null, type: oracle.NUMBER },
          status: { val: data.status ?? null, type: oracle.STRING },
        },
        TRANSACTION,
      );
      await connection.execute(
        'DELETE FROM MOVIE_FUNCTIONS_ACTIVITIES WHERE MOVIE_FUNCTION_ID = :id',
        { id },
        TRANSACTION,
      );
      await this.linkActivities(connection, id, activityIds, actorId);
    });
  }

  // Runs a scheduling transaction; a unique constraint violation means another
  // projection took the same slot.
  private async scheduling<T>(work: (connection: oracle.Connection) => Promise<T>) {
    try {
      return await this.db.transaction(async (connection) => {
        // Autonomous Database may run DML in parallel; a parallel DELETE followed by
        // INSERTs on the same table in one transaction deadlocks (ORA-12860).
        // ALTER SESSION does not commit, so the transaction stays intact.
        await connection.execute('ALTER SESSION DISABLE PARALLEL DML', {}, TRANSACTION);
        return work(connection);
      });
    } catch (error) {
      if ((error as { errorNum?: number } | null)?.errorNum === 1)
        throw new ConflictException(`${PROJECTION_MESSAGES.scheduleConflict}.`);
      throw error;
    }
  }

  private async ensureActivities(
    connection: oracle.Connection,
    data: { advertisementMinutes: number; cleaningMinutes: number },
  ) {
    return [
      await this.ensureActivity(connection, 'ADVERTISEMENT', data.advertisementMinutes),
      await this.ensureActivity(connection, 'CLEANING', data.cleaningMinutes),
    ];
  }

  private async linkActivities(
    connection: oracle.Connection,
    movieFunctionId: number,
    activityIds: readonly number[],
    actorId: number,
  ) {
    for (const activityId of activityIds)
      await connection.execute(
        `INSERT INTO MOVIE_FUNCTIONS_ACTIVITIES (MOVIE_FUNCTION_ID, ACTIVITY_ID, CREATED_BY)
         VALUES (:movieFunctionId, :activityId, :actorId)`,
        { movieFunctionId, activityId, actorId },
        TRANSACTION,
      );
  }

  // Locks the theater row so concurrent schedules for the same theater are
  // checked for conflicts one after another.
  private async lockAvailableTheater(
    connection: oracle.Connection,
    theaterId: number,
    movieId: number,
    unavailableMessage: string,
  ) {
    const theater = await connection.execute<{ BRANCH_ID: number }>(
      'SELECT BRANCH_ID FROM THEATERS WHERE THEATER_ID = :theaterId AND IS_ACTIVE = 1 FOR UPDATE',
      { theaterId: { val: theaterId, type: oracle.NUMBER } },
      TRANSACTION,
    );
    const branchId = theater.rows?.[0]?.BRANCH_ID;
    const movie =
      branchId === undefined
        ? undefined
        : await connection.execute(
            'SELECT 1 FROM CINEMA_MOVIES WHERE BRANCH_ID = :branchId AND MOVIE_ID = :movieId AND IS_AVAILABLE = 1',
            { branchId, movieId: { val: movieId, type: oracle.NUMBER } },
            TRANSACTION,
          );
    if (!movie?.rows?.length) throw new ConflictException(unavailableMessage);
  }

  private async rejectScheduleConflicts(
    connection: oracle.Connection,
    theaterId: number,
    slots: readonly ProjectionSlot[],
    excludedId?: number,
  ) {
    const binds: Binds = {
      theaterId: { val: theaterId, type: oracle.NUMBER },
      excludedId: { val: excludedId ?? null, type: oracle.NUMBER },
    };
    const overlaps = slots.map((slot, index) => {
      binds[`start${index}`] = slot.startTime;
      binds[`end${index}`] = slot.endTime;
      return `(mf.START_TIME < TO_TIMESTAMP(:end${index}, ${LOCAL_FORMAT}) AND mf.END_TIME > TO_TIMESTAMP(:start${index}, ${LOCAL_FORMAT}))`;
    });
    const conflicts = await connection.execute<{
      startTime: string;
      endTime: string;
      total: number;
    }>(
      `SELECT TO_CHAR(mf.START_TIME, ${LOCAL_FORMAT}) AS "startTime",
              TO_CHAR(mf.END_TIME, ${LOCAL_FORMAT}) AS "endTime",
              COUNT(*) OVER () AS "total"
         FROM MOVIE_FUNCTIONS mf
        WHERE mf.THEATER_ID = :theaterId AND mf.STATUS <> 'CANCELLED'
          AND (:excludedId IS NULL OR mf.MOVIE_FUNCTION_ID <> :excludedId)
          AND (${overlaps.join(' OR ')})
        ORDER BY mf.START_TIME
        FETCH FIRST ${MAX_REPORTED_CONFLICTS} ROWS ONLY`,
      binds,
      TRANSACTION,
    );
    const rows = conflicts.rows ?? [];
    if (!rows.length) return;
    const listed = rows
      .map((row) => `${formatLocal(row.startTime)} – ${formatLocal(row.endTime).slice(-5)}`)
      .join(', ');
    const remaining = rows[0]!.total - rows.length;
    throw new ConflictException(
      `${PROJECTION_MESSAGES.scheduleConflict}: ${listed}${remaining > 0 ? ` y ${remaining} más` : ''}.`,
    );
  }

  private async ensureActivity(
    connection: oracle.Connection,
    type: 'ADVERTISEMENT' | 'CLEANING',
    minutes: number,
  ): Promise<number> {
    const name = `${type === 'CLEANING' ? 'Limpieza' : 'Anuncios'} (${minutes} min)`;
    await connection.execute(
      `MERGE INTO ACTIVITIES a
       USING (SELECT :type AS TYPE, :minutes AS DURATION_MINUTES FROM dual) s
          ON (a.TYPE = s.TYPE AND a.DURATION_MINUTES = s.DURATION_MINUTES)
        WHEN NOT MATCHED THEN
        INSERT (NAME, DURATION_MINUTES, TYPE) VALUES (:name, s.DURATION_MINUTES, s.TYPE)`,
      { type, minutes, name },
      TRANSACTION,
    );
    const activity = await connection.execute<{ ACTIVITY_ID: number }>(
      'SELECT ACTIVITY_ID FROM ACTIVITIES WHERE TYPE = :type AND DURATION_MINUTES = :minutes',
      { type, minutes },
      TRANSACTION,
    );
    return activity.rows![0].ACTIVITY_ID;
  }

  private async insertProjection(
    connection: oracle.Connection,
    data: NewProjections,
    slot: ProjectionSlot,
    actorId: number,
  ): Promise<number> {
    const result = await connection.execute<unknown>(
      `INSERT INTO MOVIE_FUNCTIONS
         (MOVIE_ID, THEATER_ID, START_TIME, END_TIME, SCREENING_DATE, CREATED_BY, PRICE, STATUS)
       VALUES (:movieId, :theaterId, TO_TIMESTAMP(:startTime, ${LOCAL_FORMAT}),
               TO_TIMESTAMP(:endTime, ${LOCAL_FORMAT}), TO_DATE(:screeningDate, 'YYYY-MM-DD'),
               :actorId, :price, :status)
       RETURNING MOVIE_FUNCTION_ID INTO :id`,
      {
        movieId: data.movieId,
        theaterId: data.theaterId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        screeningDate: slot.screeningDate,
        actorId,
        price: data.price,
        status: data.status,
        id: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      },
      TRANSACTION,
    );
    return (result.outBinds as { id: number[] }).id[0];
  }
}
