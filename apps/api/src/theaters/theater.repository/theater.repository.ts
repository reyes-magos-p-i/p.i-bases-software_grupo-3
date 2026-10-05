import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Theater } from '../entities/theater.entity';
import { CreateTheaterDto } from '../dto/create-theater.dto';
import { UpdateTheaterDto } from '../dto/update-theater.dto';
import oracledb from 'oracledb';

@Injectable()
export class TheaterRepository {
  private readonly logger = new Logger(TheaterRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getAllTheaters(): Promise<Theater[]> {
    try {
      const result = await this.db.query(`
        SELECT t.theater_id,
            t.branch_id,
            t.number_seats,
            t.dimension_x,
            t.dimension_y,
            p.name AS projector_name
        FROM Theaters t
        JOIN Projectors p ON p.projector_id = t.projector_id
        ORDER BY t.theater_id
      `);
      this.logger.log(`Fetched ${result.rows?.length ?? 0} theaters from the database.`);
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as {THEATER_ID: number; BRANCH_ID: number; NUMBER_SEATS: number; DIMENSION_X: number; DIMENSION_Y: number; PROJECTOR_NAME: string}[];

      return rows.map((row) => ({
        theaterId: row.THEATER_ID,
        branchId: row.BRANCH_ID,
        numberOfSeats: row.NUMBER_SEATS,
        dimensionX: row.DIMENSION_X,
        dimensionY: row.DIMENSION_Y,
        projectorName: row.PROJECTOR_NAME,
      }));
    } catch (error) {
      this.logger.error('Error fetching theaters', error as Error);
      throw error;
    }
  }

  async createTheater(dto: CreateTheaterDto): Promise<Theater> {
    try {
        const { branchId, numberOfSeats, dimensionX, dimensionY, projectorName } = dto;

        const theaterId = await this.db.transaction(async (conn) => {
          const projectorResult = await conn.execute(
            `SELECT projector_id FROM Projectors WHERE name = :projectorName`,
            { projectorName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );

          const projectorId = (projectorResult.rows as { PROJECTOR_ID: number }[] | undefined)?.[0]?.PROJECTOR_ID;

          if (projectorId == null) {
            throw new Error(`Projector not found: ${projectorName}`);
          }

          const theaterResult = await conn.execute(
            `INSERT INTO Theaters (branch_id, number_seats, dimension_x, dimension_y, projector_id)
            VALUES (:branchId, :numberOfSeats, :dimensionX, :dimensionY, :projectorId)
            RETURNING theater_id INTO :theaterId`,
            {
                branchId,
                numberOfSeats,
                dimensionX,
                dimensionY,
                projectorId,
                theaterId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
            },
          );
          return (theaterResult.outBinds as { theaterId: number[] }).theaterId[0];
        });
        return {
          theaterId,
          branchId,
          numberOfSeats,
          dimensionX,
          dimensionY,
          projectorName,
        };
    } catch (error) {
        this.logger.error('Error creating theater', error as Error);
        throw error;
    }
  }

  async getTheaterById(id: number): Promise<Theater | null> {
    try {
      const result = await this.db.query(
        `SELECT t.theater_id,
                t.branch_id,
                t.number_seats,
                t.dimension_x,
                t.dimension_y,
                p.name AS projector_name
         FROM Theaters t
         JOIN Projectors p ON p.projector_id = t.projector_id
         WHERE t.theater_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as { THEATER_ID: number; BRANCH_ID: number; NUMBER_SEATS: number; DIMENSION_X: number; DIMENSION_Y: number; PROJECTOR_NAME: string }[];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        theaterId: row.THEATER_ID,
        branchId: row.BRANCH_ID,
        numberOfSeats: row.NUMBER_SEATS,
        dimensionX: row.DIMENSION_X,
        dimensionY: row.DIMENSION_Y,
        projectorName: row.PROJECTOR_NAME,
      };
    } catch (error) {
      this.logger.error('Error fetching theater by ID', error as Error);
      throw error;
    }
  }

  async updateTheater(id: number, updateTheaterDto: UpdateTheaterDto): Promise<Theater> {
    try {
      const setClauses: string[] = [];
      const binds: oracledb.BindParameters = { id };

      if (updateTheaterDto.branchId !== undefined) {
        setClauses.push('branch_id = :branchId');
        binds.branchId = updateTheaterDto.branchId;
      }
      if (updateTheaterDto.numberOfSeats !== undefined) {
        setClauses.push('number_seats = :numberOfSeats');
        binds.numberOfSeats = updateTheaterDto.numberOfSeats;
      }
      if (updateTheaterDto.dimensionX !== undefined) {
        setClauses.push('dimension_x = :dimensionX');
        binds.dimensionX = updateTheaterDto.dimensionX;
      }
      if (updateTheaterDto.dimensionY !== undefined) {
        setClauses.push('dimension_y = :dimensionY');
        binds.dimensionY = updateTheaterDto.dimensionY;
      }
      if (updateTheaterDto.projectorName !== undefined) {
        setClauses.push('projector_id = :projectorId');
      }

      if (setClauses.length === 0) {
        const theater = await this.getTheaterById(id);
        if (!theater) {
          throw new Error(`Theater not found: ${id}`);
        }
        return theater;
      }

      const result = await this.db.transaction(async (connection) => {
        if (updateTheaterDto.projectorName !== undefined) {
          const projectorResult = await connection.execute(
            `SELECT projector_id FROM Projectors WHERE name = :projectorName`,
            { projectorName: updateTheaterDto.projectorName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          const projectorId = (projectorResult.rows as { PROJECTOR_ID: number }[] | undefined)?.[0]?.PROJECTOR_ID;

          if (projectorId == null) {
            throw new Error(`Projector not found: ${updateTheaterDto.projectorName}`);
          }

          binds.projectorId = projectorId;
        }

        return connection.execute(
          `UPDATE Theaters SET ${setClauses.join(', ')} WHERE theater_id = :id`,
          binds,
        );
      });

      if (result.rowsAffected === 0) {
        throw new Error(`Theater not found: ${id}`);
      }

      const theater = await this.getTheaterById(id);
      if (!theater) {
        throw new Error(`Theater not found: ${id}`);
      }

      return theater;
    } catch (error) {
      this.logger.error('Error updating theater', error as Error);
      throw error;
    }
  }

  async deleteTheater(id: number): Promise<void> {
    try {
      const result = await this.db.query(
        `DELETE FROM Theaters WHERE theater_id = :id`,
        { id },
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Theater not found: ${id}`);
      }
    } catch (error) {
      this.logger.error('Error deleting theater', error as Error);
      throw error;
    }
  }
}
