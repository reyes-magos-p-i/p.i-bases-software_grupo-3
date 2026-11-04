import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { UpdateSeatsDto } from './dto/update-seats.dto';

@Injectable()
export class ChairsRepository {
  constructor(private readonly db: DatabaseService) {}

  async synchronizeLayout(
    theaterId: number,
    rows: number,
    columns: number,
    connection: oracledb.Connection,
  ): Promise<void> {
    if (
      ![theaterId, rows, columns].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      rows * columns > 5000
    ) {
      throw new BadRequestException(
        'Las filas y columnas deben ser números enteros positivos, con un máximo de 5000 asientos.',
      );
    }
    await connection.execute(
      'DELETE FROM SEATS WHERE THEATER_ID = :theaterId AND (ROW_NUMBER > :rows OR COLUMN_NUMBER > :columns)',
      { theaterId, rows, columns },
      { autoCommit: false },
    );
    // Matched seats keep their current type and state; only new positions use defaults.
    await connection.execute(
      `MERGE INTO SEATS target
       USING (SELECT :theaterId AS THEATER_ID,
                     FLOOR((LEVEL - 1) / :columns) + 1 AS ROW_NUMBER,
                     MOD(LEVEL - 1, :columns) + 1 AS COLUMN_NUMBER
                FROM DUAL CONNECT BY LEVEL <= :quantity) source
          ON (target.THEATER_ID = source.THEATER_ID AND target.ROW_NUMBER = source.ROW_NUMBER
              AND target.COLUMN_NUMBER = source.COLUMN_NUMBER)
       WHEN NOT MATCHED THEN INSERT (THEATER_ID, ROW_NUMBER, COLUMN_NUMBER)
         VALUES (source.THEATER_ID, source.ROW_NUMBER, source.COLUMN_NUMBER)`,
      { theaterId, columns, quantity: rows * columns },
      { autoCommit: false },
    );
  }

  async createForTheater(
    theaterId: number,
    x: number,
    y: number,
    conn?: oracledb.Connection,
  ) {
    for (const value of Object.values({ theaterId, x, y })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new BadRequestException(
          'La sala, las filas y las columnas deben ser números enteros positivos.',
        );
      }
    }

    const total = x * y;

    if (!Number.isSafeInteger(total) || total > 10_000) {
      throw new BadRequestException(
        'Una sala puede tener como máximo 10000 asientos.',
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
        'El número de sala debe ser un entero positivo.',
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
        'El número de sala debe ser un entero positivo.',
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
      type: row.SEAT_TYPE === 'accesibilidad' ? 'accessibility' : row.SEAT_TYPE,
      state:
        (
          {
            libre: 'free',
            ocupado: 'in-use',
            reservado: 'reserved',
            indisponible: 'unavailable',
          } as Record<string, string>
        )[row.SEAT_STATE] ?? row.SEAT_STATE,
    }));
  }

  async updateSelected(theaterId: number, dto: UpdateSeatsDto) {
    if (!Number.isSafeInteger(theaterId) || theaterId <= 0) {
      throw new BadRequestException(
        'El número de sala debe ser un entero positivo.',
      );
    }

    const positions = new Map<
      string,
      { rowNumber: number; columnNumber: number }
    >();

    for (const seat of dto.seats) {
      positions.set(`${seat.rowNumber}:${seat.columnNumber}`, seat);
    }

    const binds = [...positions.values()].map((seat) => ({
      theaterId,
      rowNumber: seat.rowNumber,
      columnNumber: seat.columnNumber,
      state: dto.state ?? null,
      type: dto.type ?? null,
    }));

    return this.db.transaction(async (connection: oracledb.Connection) => {
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
          bindDefs: {
            theaterId: { type: oracledb.NUMBER },
            rowNumber: { type: oracledb.NUMBER },
            columnNumber: { type: oracledb.NUMBER },
            state: { type: oracledb.STRING, maxSize: 32 },
            type: { type: oracledb.STRING, maxSize: 32 },
          },
        },
      );

      if (result.rowsAffected !== binds.length) {
        throw new NotFoundException(
          'Uno o más asientos seleccionados ya no existen.',
        );
      }

      return {
        theaterId,
        seatsUpdated: result.rowsAffected,
      };
    });
  }
}
