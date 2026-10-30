import { BadRequestException, Injectable } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';

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
}
