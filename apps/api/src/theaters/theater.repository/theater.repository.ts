import { BadRequestException, NotFoundException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Theater, TheaterStatusOption } from '../entities/theater.entity';
import { CreateTheaterDto } from '../dto/create-theater.dto';
import { UpdateTheaterDto } from '../dto/update-theater.dto';
import oracledb from 'oracledb';

@Injectable()
export class TheaterRepository {
  private readonly logger = new Logger(TheaterRepository.name);

  private async findStatusId(conn: oracledb.Connection, name: string): Promise<number> {
    const result = await conn.execute(
      `SELECT theater_status_id FROM TheaterStatuses WHERE name = :name`,
      { name },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const id = (result.rows as { THEATER_STATUS_ID: number }[] | undefined)?.[0]?.THEATER_STATUS_ID;
    if (id == null) {
      throw new BadRequestException(`Theater status not found: ${name}`);
    }
    return id;
  }

  constructor(private readonly db: DatabaseService) {}

  async getAllTheaters(): Promise<Theater[]> {
    try {
      const result = await this.db.query(`
      SELECT t.theater_id,
          c.name AS cinema,
          t.number_seats,
          t.dimension_x,
          t.dimension_y,
          p.name AS projector_name,
          t.is_active,
          ts.name AS status
      FROM Theaters t
      JOIN TheaterStatuses ts ON ts.theater_status_id = t.theater_status_id
      JOIN Cinemas c ON c.branch_id = t.branch_id
      JOIN Projectors p ON p.projector_id = t.projector_id
      ORDER BY t.theater_id
      `);
      this.logger.log(`Fetched ${result.rows?.length ?? 0} theaters from the database.`);
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as { THEATER_ID: number; CINEMA: string; NUMBER_SEATS: number; DIMENSION_X: number; DIMENSION_Y: number; PROJECTOR_NAME: string; IS_ACTIVE: number; STATUS: string }[];

      return rows.map((row) => ({
        theaterId: row.THEATER_ID,
        cinema: row.CINEMA,
        numberOfSeats: row.NUMBER_SEATS,
        dimensionX: row.DIMENSION_X,
        dimensionY: row.DIMENSION_Y,
        projectorName: row.PROJECTOR_NAME,
        isActive: row.IS_ACTIVE === 1,
        status: row.STATUS,
      }));
    } catch (error) {
      this.logger.error('Error fetching theaters', error as Error);
      throw error;
    }
  }

  async getTheaterStatuses(): Promise<TheaterStatusOption[]> {
    try {
      const result = await this.db.query(
        `SELECT theater_status_id, name FROM TheaterStatuses ORDER BY theater_status_id`,
      );
      const rows = (result.rows ?? []) as { THEATER_STATUS_ID: number; NAME: string }[];
      return rows.map((row) => ({ theaterStatusId: row.THEATER_STATUS_ID, name: row.NAME }));
    } catch (error) {
      this.logger.error('Error fetching theater statuses', error as Error);
      throw error;
    }
  }

  async createTheater(dto: CreateTheaterDto): Promise<Theater> {
    try {
        const { cinema, numberOfSeats, dimensionX, dimensionY, projectorName } = dto;
        const isActive = dto.isActive ?? true;
        const status = dto.status ?? 'Disponible';

        const theaterId = await this.db.transaction(async (conn) => {
          // Hacemos join de projectores
          const projectorResult = await conn.execute(
            `SELECT projector_id FROM Projectors WHERE name = :projectorName`,
            { projectorName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );

          const projectorId = (projectorResult.rows as { PROJECTOR_ID: number }[] | undefined)?.[0]?.PROJECTOR_ID;

          if (projectorId == null) {
            throw new Error(`Projector not found: ${projectorName}`);
          }
          // Hacemos join de cinemas
          const cinemasResult = await conn.execute(
            `SELECT branch_id FROM Cinemas WHERE name = :cinema`,
            { cinema },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );

          const branchId = (cinemasResult.rows as { BRANCH_ID: number }[] | undefined)?.[0]?.BRANCH_ID;

          if (branchId == null) {
            throw new Error(`Cinema not found: ${cinema}`);
          }

          const theaterStatusId = await this.findStatusId(conn, status);

          const theaterResult = await conn.execute(
            `INSERT INTO Theaters (branch_id, number_seats, dimension_x, dimension_y, projector_id, is_active, theater_status_id)
            VALUES (:branchId, :numberOfSeats, :dimensionX, :dimensionY, :projectorId, :isActive,
              :theaterStatusId)
            RETURNING theater_id INTO :theaterId`,
            {
                branchId,
                numberOfSeats,
                dimensionX,
                dimensionY,
                projectorId,
                isActive: isActive ? 1 : 0,
                theaterStatusId,
                theaterId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
            },
          );
          return (theaterResult.outBinds as { theaterId: number[] }).theaterId[0];
        });
        return {
          theaterId,
          cinema,
          numberOfSeats,
          dimensionX,
          dimensionY,
          projectorName,
          isActive,
          status,
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
                c.name AS cinema,
                t.number_seats,
                t.dimension_x,
                t.dimension_y,
                p.name AS projector_name,
                t.is_active,
                ts.name AS status
        FROM Theaters t
        JOIN TheaterStatuses ts ON ts.theater_status_id = t.theater_status_id
        JOIN Cinemas c ON c.branch_id = t.branch_id
        JOIN Projectors p ON p.projector_id = t.projector_id
        WHERE t.theater_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as { THEATER_ID: number; CINEMA: string; NUMBER_SEATS: number; DIMENSION_X: number; DIMENSION_Y: number; PROJECTOR_NAME: string; IS_ACTIVE: number; STATUS: string }[];

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        theaterId: row.THEATER_ID,
        cinema: row.CINEMA,
        numberOfSeats: row.NUMBER_SEATS,
        dimensionX: row.DIMENSION_X,
        dimensionY: row.DIMENSION_Y,
        projectorName: row.PROJECTOR_NAME,
        isActive: row.IS_ACTIVE === 1,
        status: row.STATUS,
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

      if (updateTheaterDto.cinema !== undefined) {
        setClauses.push('branch_id = :branchId');
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
      if (updateTheaterDto.isActive !== undefined) {
        setClauses.push('is_active = :isActive');
        binds.isActive = updateTheaterDto.isActive ? 1 : 0;
      }
      if (updateTheaterDto.status !== undefined) {
        setClauses.push('theater_status_id = :theaterStatusId');
      }

      if (setClauses.length === 0) {
        const theater = await this.getTheaterById(id);
        if (!theater) {
          throw new NotFoundException(`Theater not found: ${id}`);
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

        if (updateTheaterDto.cinema !== undefined) {
          const cinemaResult = await connection.execute(
            `SELECT branch_id FROM Cinemas WHERE name = :cinema`,
            { cinema: updateTheaterDto.cinema },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          const branchId = (cinemaResult.rows as { BRANCH_ID: number }[] | undefined)?.[0]?.BRANCH_ID;

          if (branchId == null) {
            throw new Error(`Cinema not found: ${updateTheaterDto.cinema}`);
          }

          binds.branchId = branchId;
        }

        if (updateTheaterDto.status !== undefined) {
          binds.theaterStatusId = await this.findStatusId(connection, updateTheaterDto.status);
        }

        return connection.execute(
          `UPDATE Theaters SET ${setClauses.join(', ')} WHERE theater_id = :id`,
          binds,
        );
      });

      if (result.rowsAffected === 0) {
        throw new NotFoundException(`Theater not found: ${id}`);
      }

      const theater = await this.getTheaterById(id);
      if (!theater) {
        throw new NotFoundException(`Theater not found: ${id}`);
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
        `UPDATE Theaters SET is_active = 0 WHERE theater_id = :id`,
        { id },
      );

      if (result.rowsAffected === 0) {
        throw new NotFoundException(`Theater not found: ${id}`);
      }
    } catch (error) {
      this.logger.error('Error deleting theater', error as Error);
      throw error;
    }
  }
}
