import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Ticket } from '../entities/ticket.entity';
import { AlternativeShowtimes } from '../entities/AlternativeShowtimes.entity';
import oracledb from 'oracledb';

export interface ClientTicket {
  id: number;
  movieFunctionId: number;
  title: string;
  branchName: string;
  theaterId: number;
  startsAt: string;
  functionStatus: string;
  seatRow: number;
  seatColumn: number;
}

type ClientTicketRow = ClientTicket;

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
        `SELECT a.movie_function_id,
       a.theater_id,
       a."TIME",
       a."DATE",
       a.seat_row,
       (SELECT MIN(s.column_number)
          FROM Seats s
         WHERE s.theater_id = a.theater_id
           AND s.row_number = a.seat_row
           AND s.seat_state <> 'indisponible'
           AND NOT EXISTS (
               SELECT 1 FROM Tickets tk
                WHERE tk.movie_function_id = a.movie_function_id
                  AND tk.seat_row    = s.row_number
                  AND tk.seat_column = s.column_number)) AS seat_column
FROM (
    SELECT mf.movie_function_id,
           mf.theater_id,
           mf.start_time,
           TO_CHAR(mf.start_time, 'HH24:MI') AS "TIME",
           TO_CHAR(mf.screening_date, 'FMDD "de" month, YYYY',
                   'NLS_DATE_LANGUAGE = SPANISH') AS "DATE",
           (SELECT MIN(s.row_number)
              FROM Seats s
             WHERE s.theater_id = mf.theater_id
               AND s.seat_state <> 'indisponible'
               AND NOT EXISTS (
                   SELECT 1 FROM Tickets tk
                    WHERE tk.movie_function_id = mf.movie_function_id
                      AND tk.seat_row    = s.row_number
                      AND tk.seat_column = s.column_number)) AS seat_row
      FROM Tickets t
      JOIN Movie_functions cur ON cur.movie_function_id = t.movie_function_id
      JOIN Theaters cur_th     ON cur_th.theater_id = cur.theater_id
      JOIN Movie_functions mf  ON mf.movie_id = cur.movie_id
      JOIN Theaters mf_th      ON mf_th.theater_id = mf.theater_id
                                         AND mf_th.branch_id  = cur_th.branch_id
     WHERE t.tickets_id = :tickets_id
       AND mf.status = 'ACTIVE'
       AND mf.start_time > GREATEST(SYSTIMESTAMP, cur.start_time)
       AND mf.start_time < SYSTIMESTAMP + INTERVAL '7' DAY
) a
WHERE a.seat_row IS NOT NULL
ORDER BY a.start_time`,
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
  /** The ticket with its current projection, only when it belongs to the client. */
  async findClientTicket(
    ticketId: number,
    clientId: number,
  ): Promise<ClientTicket | null> {
    const result = await this.db.query<ClientTicketRow>(
      `SELECT t.TICKETS_ID AS "id",
              mf.MOVIE_FUNCTION_ID AS "movieFunctionId",
              m.TITLE AS "title",
              TRIM(cn.NAME) AS "branchName",
              t.THEATER_ID AS "theaterId",
              TO_CHAR(mf.START_TIME, 'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "startsAt",
              mf.STATUS AS "functionStatus",
              t.SEAT_ROW AS "seatRow",
              t.SEAT_COLUMN AS "seatColumn"
         FROM TICKETS t
         JOIN INVOICES i ON i.INVOICE_ID = t.INVOICE_ID
         JOIN MOVIE_FUNCTIONS mf ON mf.MOVIE_FUNCTION_ID = t.MOVIE_FUNCTION_ID
         JOIN MOVIES m ON m.MOVIE_ID = mf.MOVIE_ID
         JOIN THEATERS th ON th.THEATER_ID = t.THEATER_ID
         JOIN CINEMAS cn ON cn.BRANCH_ID = th.BRANCH_ID
        WHERE t.TICKETS_ID = :ticket_id
          AND i.CLIENT_ID = :client_id`,
      { ticket_id: ticketId, client_id: clientId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row ? { ...row } : null;
  }

  /** Records a refund request once per ticket; repeated requests change nothing. */
  async requestRefund(ticketId: number): Promise<void> {
    await this.db.query(
      `MERGE INTO TICKET_REFUND_REQUESTS r
       USING (SELECT :ticket_id AS TICKET_ID FROM DUAL) s
          ON (r.TICKET_ID = s.TICKET_ID)
        WHEN NOT MATCHED THEN
          INSERT (TICKET_ID) VALUES (s.TICKET_ID)`,
      { ticket_id: ticketId },
    );
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
