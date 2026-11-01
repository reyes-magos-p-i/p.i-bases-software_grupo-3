import { Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import {
  pricingSettings,
  ticketPrice,
  TICKET_POLICY,
} from '../common/pricing/ticket-pricing';
import type { PurchaseFunction, PurchaseSeat } from './purchase.types';
export const FUNCTION_SOURCE = `FROM MOVIE_FUNCTIONS mf JOIN MOVIES m ON m.MOVIE_ID=mf.MOVIE_ID JOIN THEATERS t ON t.THEATER_ID=mf.THEATER_ID JOIN CINEMAS c ON c.BRANCH_ID=t.BRANCH_ID`;
export const FUNCTION_COLUMNS = `mf.MOVIE_FUNCTION_ID AS "id", m.MOVIE_ID AS "movieId", m.TITLE AS "title", m.SYNOPSIS AS "synopsis", NVL(m.POSTER_IMAGE, '') AS "posterImage", c.BRANCH_ID AS "branchId", TRIM(c.NAME) AS "branchName", t.THEATER_ID AS "theaterId", t.DIMENSION_X AS "rows", t.DIMENSION_Y AS "columns", TO_CHAR(mf.START_TIME, 'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "startsAt", TO_CHAR(mf.END_TIME, 'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' AS "endsAt", mf.STATUS AS "status", mf.PROJECTION_FORMAT AS "format", mf.TECHNOLOGY AS "technology", mf.IS_PREMIERE AS "isPremiere", CASE WHEN mf.STATUS='ACTIVE' AND mf.START_TIME>CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS TIMESTAMP) AND t.IS_ACTIVE=1 AND c.STATUS='ACTIVE' AND EXISTS(SELECT 1 FROM CINEMA_MOVIES cm WHERE cm.MOVIE_ID=mf.MOVIE_ID AND cm.BRANCH_ID=t.BRANCH_ID AND cm.IS_AVAILABLE=1) THEN 1 ELSE 0 END AS "available"`;
export type FunctionRow = Omit<
  PurchaseFunction,
  'isPremiere' | 'available' | 'price'
> & { isPremiere: number; available: number };
export function toPurchaseFunction(row: FunctionRow): PurchaseFunction {
  const settings = pricingSettings({
    format: row.format,
    technology: row.technology,
    isPremiere: row.isPremiere === 1,
  });
  return {
    ...row,
    ...settings,
    available: row.available === 1,
    price: ticketPrice(settings).unitPrice,
  };
}
export function seatQuery(positions?: number[]) {
  const filter = positions
    ? ` AND ((s.ROW_NUMBER-1)*:columns+s.COLUMN_NUMBER) IN (${positions.map((_id, index) => ':p' + index).join(',')})`
    : '';
  return `SELECT ((s.ROW_NUMBER-1)*:columns+s.COLUMN_NUMBER) AS "positionId", s.THEATER_ID AS "theaterId", s.ROW_NUMBER AS "rowNumber", s.COLUMN_NUMBER AS "columnNumber", CASE s.SEAT_TYPE WHEN 'accesibilidad' THEN 'accessibility' ELSE s.SEAT_TYPE END AS "type", CASE WHEN EXISTS(SELECT 1 FROM TICKETS tk WHERE tk.MOVIE_FUNCTION_ID=:functionId AND tk.THEATER_ID=s.THEATER_ID AND tk.SEAT_ROW=s.ROW_NUMBER AND tk.SEAT_COLUMN=s.COLUMN_NUMBER) THEN 'in-use' WHEN s.SEAT_STATE='libre' THEN 'free' WHEN s.SEAT_STATE='ocupado' THEN 'in-use' WHEN s.SEAT_STATE='reservado' THEN 'reserved' ELSE 'unavailable' END AS "state" FROM SEATS s WHERE s.THEATER_ID=:theaterId${filter} ORDER BY s.ROW_NUMBER,s.COLUMN_NUMBER${positions ? ' FOR UPDATE OF s.ROW_NUMBER WAIT 5' : ''}`;
}
@Injectable()
export class PurchaseCatalogRepository {
  constructor(private readonly db: DatabaseService) {}
  async getMovie(id: number) {
    const result = await this.db.query(
      `SELECT MOVIE_ID AS "id", TITLE AS "title", SYNOPSIS AS "synopsis", NVL(POSTER_IMAGE,'') AS "posterImage" FROM MOVIES WHERE MOVIE_ID=:id`,
      { id },
    );
    return result.rows?.[0] ?? null;
  }
  async getFunctions(movieId: number) {
    const result = await this.db.query<FunctionRow>(
      `SELECT ${FUNCTION_COLUMNS} ${FUNCTION_SOURCE} WHERE mf.MOVIE_ID=:movieId ORDER BY mf.START_TIME,mf.MOVIE_FUNCTION_ID`,
      { movieId },
    );
    return (result.rows ?? [])
      .filter((row) => row.available === 1)
      .map(toPurchaseFunction);
  }
  async getFunction(id: number, connection?: oracle.Connection) {
    const sql = `SELECT ${FUNCTION_COLUMNS} ${FUNCTION_SOURCE} WHERE mf.MOVIE_FUNCTION_ID=:id`;
    const result = connection
      ? await connection.execute<FunctionRow>(
          sql,
          { id },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        )
      : await this.db.query<FunctionRow>(sql, { id });
    return result.rows?.[0] ? toPurchaseFunction(result.rows[0]) : null;
  }
  async getSeats(context: PurchaseFunction) {
    const result = await this.db.query<PurchaseSeat>(seatQuery(), {
      columns: context.columns,
      theaterId: context.theaterId,
      functionId: context.id,
    });
    return {
      function: context,
      seats: result.rows ?? [],
      categories: TICKET_POLICY.categories,
    };
  }
}
