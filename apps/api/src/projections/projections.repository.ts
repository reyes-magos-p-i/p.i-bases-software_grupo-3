import { ConflictException, Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { likePattern } from '../users/user-search.util';
import { PROJECTION_MESSAGES } from './projection-messages';
import { formatLocal, type ProjectionSlot } from './projection-schedule';
import type {
  AvailableMovie,
  CreatedProjection,
  CreatedProjections,
  NewProjections,
  ProjectionCatalogs,
} from './types/projection.types';

const LOCAL_FORMAT = `'YYYY-MM-DD"T"HH24:MI'`;
const TRANSACTION = {
  outFormat: oracle.OUT_FORMAT_OBJECT,
  autoCommit: false,
} as const;
const MOVIE_SEARCH_LIMIT = 10;

type Binds = Exclude<oracle.BindParameters, unknown[]>;

@Injectable()
export class ProjectionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSchedulingOptions(): Promise<ProjectionCatalogs> {
    const [cinemas, theaters] = await Promise.all([
      this.db.query<{ BRANCH_ID: number; NAME: string }>(
        'SELECT BRANCH_ID, NAME FROM CINEMAS ORDER BY NAME',
      ),
      this.db.query<{
        THEATER_ID: number;
        BRANCH_ID: number;
        NUMBER_SEATS: number;
      }>(
        'SELECT THEATER_ID, BRANCH_ID, NUMBER_SEATS FROM THEATERS WHERE IS_ACTIVE = 1 ORDER BY THEATER_ID',
      ),
    ]);
    return {
      cinemas: (cinemas.rows ?? []).map((row) => ({
        branchId: row.BRANCH_ID,
        name: row.NAME,
      })),
      theaters: (theaters.rows ?? []).map((row) => ({
        theaterId: row.THEATER_ID,
        branchId: row.BRANCH_ID,
        numberOfSeats: row.NUMBER_SEATS,
      })),
    };
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
    try {
      const projections = await this.db.transaction(async (connection) => {
        await this.lockAvailableTheater(connection, data.theaterId, data.movieId);
        await this.rejectScheduleConflicts(connection, data.theaterId, data.slots);
        const activityIds = [
          await this.ensureActivity(connection, 'ADVERTISEMENT', data.advertisementMinutes),
          await this.ensureActivity(connection, 'CLEANING', data.cleaningMinutes),
        ];
        const created: CreatedProjection[] = [];
        for (const slot of data.slots) {
          const movieFunctionId = await this.insertProjection(connection, data, slot, actorId);
          for (const activityId of activityIds)
            await connection.execute(
              `INSERT INTO MOVIE_FUNCTIONS_ACTIVITIES (MOVIE_FUNCTION_ID, ACTIVITY_ID, CREATED_BY)
               VALUES (:movieFunctionId, :activityId, :actorId)`,
              { movieFunctionId, activityId, actorId },
              TRANSACTION,
            );
          created.push({ movieFunctionId, startTime: slot.startTime, endTime: slot.endTime });
        }
        return created;
      });
      return { status: data.status, price: data.price, projections };
    } catch (error) {
      if ((error as { errorNum?: number } | null)?.errorNum === 1)
        throw new ConflictException(`${PROJECTION_MESSAGES.scheduleConflict}.`);
      throw error;
    }
  }

  // Locks the theater row so concurrent schedules for the same theater are
  // checked for conflicts one after another.
  private async lockAvailableTheater(
    connection: oracle.Connection,
    theaterId: number,
    movieId: number,
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
    if (!movie?.rows?.length)
      throw new ConflictException(PROJECTION_MESSAGES.unavailable);
  }

  private async rejectScheduleConflicts(
    connection: oracle.Connection,
    theaterId: number,
    slots: readonly ProjectionSlot[],
  ) {
    const binds: Binds = { theaterId: { val: theaterId, type: oracle.NUMBER } };
    const overlaps = slots.map((slot, index) => {
      binds[`start${index}`] = slot.startTime;
      binds[`end${index}`] = slot.endTime;
      return `(mf.START_TIME < TO_TIMESTAMP(:end${index}, ${LOCAL_FORMAT}) AND mf.END_TIME > TO_TIMESTAMP(:start${index}, ${LOCAL_FORMAT}))`;
    });
    const conflict = await connection.execute<{ startTime: string; endTime: string }>(
      `SELECT TO_CHAR(mf.START_TIME, ${LOCAL_FORMAT}) AS "startTime",
              TO_CHAR(mf.END_TIME, ${LOCAL_FORMAT}) AS "endTime"
         FROM MOVIE_FUNCTIONS mf
        WHERE mf.THEATER_ID = :theaterId AND mf.STATUS <> 'CANCELLED'
          AND (${overlaps.join(' OR ')})
        ORDER BY mf.START_TIME
        FETCH FIRST 1 ROWS ONLY`,
      binds,
      TRANSACTION,
    );
    const existing = conflict.rows?.[0];
    if (existing)
      throw new ConflictException(
        `${PROJECTION_MESSAGES.scheduleConflict} (${formatLocal(existing.startTime)} – ${formatLocal(existing.endTime).slice(-5)}).`,
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
