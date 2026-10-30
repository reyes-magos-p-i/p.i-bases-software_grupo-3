import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Ticket } from '../entities/ticket.entity';
import { AlternativeShowtimes } from '../entities/AlternativeShowtimes.entity';
import oracledb from 'oracledb';

@Injectable()
export class TicketsRepository {
  private readonly logger = new Logger(TicketsRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async getTicketById(id: number): Promise<Ticket | null> {
    try {
      const result = await this.db.query(
        `SELECT m.title, mf.theater_id, TO_CHAR(mf.start_time, 'YYYY/MM/DD HH24:MI') START_TIME, TO_CHAR(mf.end_time, 'YYYY/MM/DD HH24:MI') END_TIME, t.seat_row || '-' || t.seat_column AS SEAT
        FROM TICKETS t
        JOIN Movie_functions mf
        ON t.movie_function_id = mf.movie_function_id
        JOIN Movies m
        ON mf.movie_id = m.movie_id
        WHERE t.tickets_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as {
        TITLE: string;
        THEATER_ID: number;
        START_TIME: string;
        END_TIME: string;
        SEAT: string;
      }[];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        title: row.TITLE,
        theaterId: row.THEATER_ID,
        startTime: row.START_TIME,
        endTime: row.END_TIME,
        seat: row.SEAT,
      };
    } catch (error) {
      this.logger.error('Error fetching ticket by ID', error as Error);
      throw error;
    }
  }

  async getAlternativeShowtimesByTicketId(
    id: number,
  ): Promise<AlternativeShowtimes[]> {
    try {
      const result = await this.db.query(
        `SELECT mf.movie_function_id,
       mf.theater_id,
       TO_CHAR(mf.start_time, 'HH24:MI') AS "TIME",
       TO_CHAR(mf.screening_date, 'FMDD "de" month, YYYY',
               'NLS_DATE_LANGUAGE = SPANISH') AS "DATE",
       fs.seat_row,
       fs.seat_column
FROM PRODUCTION.Tickets t
JOIN PRODUCTION.Movie_functions cur ON cur.movie_function_id = t.movie_function_id
JOIN PRODUCTION.Movie_functions mf  ON mf.movie_id = cur.movie_id
                                   AND mf.movie_function_id <> cur.movie_function_id
CROSS APPLY (
    SELECT s.row_number AS seat_row,
           s.column_number AS seat_column
    FROM PRODUCTION.Seats s
    WHERE s.theater_id = mf.theater_id
      AND s.seat_state <> 'indisponible'
      AND (s.theater_id, s.row_number, s.column_number) NOT IN (
          SELECT tk.theater_id, tk.seat_row, tk.seat_column
          FROM PRODUCTION.Tickets tk
          WHERE tk.movie_function_id = mf.movie_function_id)
    ORDER BY s.row_number, s.column_number
    FETCH FIRST 1 ROW ONLY
) fs
WHERE t.tickets_id = :tickets_id
  AND mf.status = 'ACTIVE'
  AND mf.start_time >  SYSTIMESTAMP
  AND mf.start_time <  SYSTIMESTAMP + INTERVAL '7' DAY
ORDER BY mf.start_time`,
        { tickets_id: id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = (result.rows ?? []) as {
        MOVIE_FUNCTION_ID: number;
        THEATER_ID: number;
        TIME: string;
        DATE: string;
        SEAT_ROW: number;
        SEAT_COLUMN: number;
      }[];

      return rows.map((row) => ({
        movieFunctionId: row.MOVIE_FUNCTION_ID,
        theaterId: row.THEATER_ID,
        time: row.TIME,
        date: row.DATE,
        seatRow: row.SEAT_ROW,
        seatColumn: row.SEAT_COLUMN,
      }));
    } catch (error) {
      this.logger.error(
        'Error fetching alternative showtimes by ticket ID',
        error as Error,
      );
      throw error;
    }
  }
  async updateMovieFunction(
    ticketId: number,
    movieFunctionId: number,
    theaterId: number,
    seatRow: number,
    seatColumn: number,
  ): Promise<number> {
    try {
      const result = await this.db.query(
        `UPDATE TICKETS t
        SET t.movie_function_id = :movie_function_id,
            t.theater_id = :theater_id,
            t.seat_row = :seat_row,
            t.seat_column = :seat_column
        WHERE t.tickets_id = :tickets_id
          AND NOT EXISTS (SELECT 1
                          FROM TICKETS tk
                          WHERE tk.movie_function_id = :movie_function_id
                            AND tk.theater_id = :theater_id
                            AND tk.seat_row = :seat_row
                            AND tk.seat_column = :seat_column)`,
        {
          tickets_id: ticketId,
          movie_function_id: movieFunctionId,
          theater_id: theaterId,
          seat_row: seatRow,
          seat_column: seatColumn,
        },
      );
      return result.rowsAffected ?? 0;
    } catch (error) {
      const failure = error as { errorNum?: number; message?: string } | null;
      if (
        failure?.errorNum === 1 &&
        /\bUQ_TICKETS_FUNCTION_SEAT\b/u.test(failure.message ?? '')
      )
        return 0;
      this.logger.error('Error updating ticket movie function', error as Error);
      throw error;
    }
  }
}
