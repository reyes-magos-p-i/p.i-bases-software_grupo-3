import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { UpdateSeatsDto } from './dto/update-seats.dto';

@Injectable()
export class ChairsRepository {
  constructor(private readonly db: DatabaseService) {}

async createForTheater(
    theaterId: number,
    x: number,
    y: number,
    conn?: oracledb.Connection,
  ) {
    for (const [name, value] of Object.entries({ theaterId, x, y })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new BadRequestException(
          `${name} must be a positive safe integer`,
        );
      }
    }

    const total = x * y;

    if (!Number.isSafeInteger(total) || total > 10_000) {
      throw new BadRequestException(
        'A theater may have at most 10000 chairs',
      );
    }

    const chairs: {
      theaterId: number;
      rowNumber: number;
      columnNumber: number;
    }[] = [];

    for (let rowNumber = 1; rowNumber <= x; rowNumber++) {
      for (let columnNumber = 1; columnNumber <= y; columnNumber++) {
        chairs.push({ theaterId, rowNumber, columnNumber });
      }
    }

    const insertChairs = async (connection: oracledb.Connection) => {
      await connection.executeMany(
        `INSERT INTO SEATS (THEATER_ID, ROW_NUMBER, COLUMN_NUMBER)
         VALUES (:theaterId, :rowNumber, :columnNumber)`,
        chairs,
        {
          autoCommit: false,
          batchErrors: false,
          bindDefs: {
            theaterId: { type: oracledb.NUMBER },
            rowNumber: { type: oracledb.NUMBER },
            columnNumber: { type: oracledb.NUMBER },
          },
        },
      );

      return { theaterId, rows: x, columns: y, chairsCreated: total };
    };

    if (conn) {
      return insertChairs(conn);
    }

    return this.db.transaction(insertChairs);
  }

  async deleteForTheater(
    theaterId: number,
    conn?: oracledb.Connection,
  ): Promise<void> {
    if (!Number.isSafeInteger(theaterId) || theaterId <= 0) {
      throw new BadRequestException(
        'theaterId must be a positive safe integer',
      );
    }

    const deleteSeats = async (connection: oracledb.Connection) => {
      await connection.execute(
        `DELETE FROM SEATS WHERE THEATER_ID = :theaterId`,
        { theaterId },
        { autoCommit: false },
      );
    };

    if (conn) {
      await deleteSeats(conn);
    } else {
      await this.db.transaction(deleteSeats);
    }
  }

  async findByTheater(theaterId: number) {
    if (!Number.isSafeInteger(theaterId) || theaterId <= 0) {
      throw new BadRequestException(
        'theaterId must be a positive safe integer',
      );
    }

    const result = await this.db.query(
      `SELECT
        THEATER_ID,
        ROW_NUMBER,
        COLUMN_NUMBER,
        SEAT_TYPE,
        SEAT_STATE
      FROM SEATS
      WHERE THEATER_ID = :theaterId
      ORDER BY ROW_NUMBER, COLUMN_NUMBER`,
      { theaterId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (result.rows ?? []) as {
      THEATER_ID: number;
      ROW_NUMBER: number;
      COLUMN_NUMBER: number;
      SEAT_TYPE: string;
      SEAT_STATE: string;
    }[];

    return rows.map((row) => ({
      theaterId: row.THEATER_ID,
      rowNumber: row.ROW_NUMBER,
      columnNumber: row.COLUMN_NUMBER,
      type: row.SEAT_TYPE,
      state: row.SEAT_STATE,
    }));
  }

  async updateSelected(theaterId: number, dto: UpdateSeatsDto) {
    if (!Number.isSafeInteger(theaterId) || theaterId <= 0) {
      throw new BadRequestException(
        'theaterId must be a positive safe integer',
      );
    }

    const positions = new Map<
      string,
      { rowNumber: number; columnNumber: number }
    >();

    for (const seat of dto.seats) {
      positions.set(
        `${seat.rowNumber}:${seat.columnNumber}`,
        seat,
      );
    }

    const binds = [...positions.values()].map(seat => ({
      theaterId,
      rowNumber: seat.rowNumber,
      columnNumber: seat.columnNumber,
      state: dto.state ?? null,
      type: dto.type ?? null,
    }));

    return this.db.transaction(
      async (connection: oracledb.Connection) => {
        const result = await connection.executeMany(
          `
          UPDATE SEATS
          SET SEAT_STATE = COALESCE(:state, SEAT_STATE),
              SEAT_TYPE = COALESCE(:type, SEAT_TYPE)
          WHERE THEATER_ID = :theaterId
            AND ROW_NUMBER = :rowNumber
            AND COLUMN_NUMBER = :columnNumber
          `,
          binds,
          {
            autoCommit: false,
            batchErrors: false,
            dmlRowCounts: true,
            bindDefs: {
              theaterId: { type: oracledb.NUMBER },
              rowNumber: { type: oracledb.NUMBER },
              columnNumber: { type: oracledb.NUMBER },
              state: { type: oracledb.STRING, maxSize: 32 },
              type: { type: oracledb.STRING, maxSize: 32 },
            },
          },
        );

        const counts = result.dmlRowCounts;

        if (
          !counts ||
          counts.length !== binds.length ||
          counts.some(count => count !== 1)
        ) {
          throw new NotFoundException(
            'One or more seats do not exist',
          );
        }

        return {
          theaterId,
          seatsUpdated: binds.length,
        };
      },
    );
  }
}
