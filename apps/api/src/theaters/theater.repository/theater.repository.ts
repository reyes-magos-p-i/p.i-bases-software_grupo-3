import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Theater, TheaterStatusOption } from '../entities/theater.entity';
import { CreateTheaterDto } from '../dto/create-theater.dto';
import { UpdateTheaterDto } from '../dto/update-theater.dto';
import oracledb from 'oracledb';
import { ChairsRepository } from '../chairs.repository';

type TheaterWithLayoutPermission = Theater & { canResize: boolean };

@Injectable()
export class TheaterRepository {
  private readonly logger = new Logger(TheaterRepository.name);

  private async findStatusId(
    conn: oracledb.Connection,
    name: string,
  ): Promise<number> {
    const result = await conn.execute(
      `SELECT theater_status_id FROM TheaterStatuses WHERE name = :name`,
      { name },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const id = (result.rows as { THEATER_STATUS_ID: number }[] | undefined)?.[0]
      ?.THEATER_STATUS_ID;
    if (id == null) {
      throw new BadRequestException('Selecciona un estado de sala válido.');
    }
    return id;
  }

  constructor(
    private readonly db: DatabaseService,
    private readonly chairsRepository: ChairsRepository,
  ) {}

  async getAllTheaters(): Promise<TheaterWithLayoutPermission[]> {
    try {
      const result = await this.db.query(`
      SELECT t.theater_id,
          c.name AS cinema,
          t.number_seats,
          t.dimension_x,
          t.dimension_y,
          p.name AS projector_name,
          t.is_active,
          ts.name AS status,
          CASE WHEN EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS mf WHERE mf.THEATER_ID = t.THEATER_ID)
            THEN 0 ELSE 1 END AS can_resize
      FROM Theaters t
      JOIN TheaterStatuses ts ON ts.theater_status_id = t.theater_status_id
      JOIN Cinemas c ON c.branch_id = t.branch_id
      JOIN Projectors p ON p.projector_id = t.projector_id
      ORDER BY t.theater_id
      `);
      this.logger.log(
        `Fetched ${result.rows?.length ?? 0} theaters from the database.`,
      );
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as {
        THEATER_ID: number;
        CINEMA: string;
        NUMBER_SEATS: number;
        DIMENSION_X: number;
        DIMENSION_Y: number;
        PROJECTOR_NAME: string;
        IS_ACTIVE: number;
        STATUS: string;
        CAN_RESIZE: number;
      }[];

      return rows.map((row) => ({
        theaterId: row.THEATER_ID,
        cinema: row.CINEMA,
        numberOfSeats: row.NUMBER_SEATS,
        dimensionX: row.DIMENSION_X,
        dimensionY: row.DIMENSION_Y,
        projectorName: row.PROJECTOR_NAME,
        isActive: row.IS_ACTIVE === 1,
        status: row.STATUS,
        canResize: row.CAN_RESIZE === 1,
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
      const rows = (result.rows ?? []) as {
        THEATER_STATUS_ID: number;
        NAME: string;
      }[];
      return rows.map((row) => ({
        theaterStatusId: row.THEATER_STATUS_ID,
        name: row.NAME,
      }));
    } catch (error) {
      this.logger.error('Error fetching theater statuses', error as Error);
      throw error;
    }
  }

  async createTheater(
    dto: CreateTheaterDto,
  ): Promise<TheaterWithLayoutPermission> {
    try {
      const { cinema, numberOfSeats, dimensionX, dimensionY, projectorName } =
        dto;
      const isActive = dto.isActive ?? true;
      const status = dto.status ?? 'Disponible';

      const theaterId = await this.db.transaction(async (conn) => {
        const projectorResult = await conn.execute(
          `SELECT projector_id FROM Projectors WHERE name = :projectorName`,
          { projectorName },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

        const projectorId = (
          projectorResult.rows as { PROJECTOR_ID: number }[] | undefined
        )?.[0]?.PROJECTOR_ID;

        if (projectorId == null) {
          throw new BadRequestException('Selecciona un proyector válido.');
        }
        const cinemasResult = await conn.execute(
          `SELECT branch_id FROM Cinemas WHERE name = :cinema`,
          { cinema },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

        const branchId = (
          cinemasResult.rows as { BRANCH_ID: number }[] | undefined
        )?.[0]?.BRANCH_ID;

        if (branchId == null) {
          throw new BadRequestException('Selecciona una sucursal válida.');
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
        const createdTheaterId = (
          theaterResult.outBinds as { theaterId: number[] }
        ).theaterId[0];

        await this.chairsRepository.createForTheater(
          createdTheaterId,
          dimensionX,
          dimensionY,
          conn,
        );

        return createdTheaterId;
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
        canResize: true,
      };
    } catch (error) {
      this.logger.error('Error creating theater', error as Error);
      throw error;
    }
  }

  async getTheaterById(
    id: number,
  ): Promise<TheaterWithLayoutPermission | null> {
    try {
      const result = await this.db.query(
        `SELECT t.theater_id,
                c.name AS cinema,
                t.number_seats,
                t.dimension_x,
                t.dimension_y,
                p.name AS projector_name,
                t.is_active,
                ts.name AS status,
                CASE WHEN EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS mf WHERE mf.THEATER_ID = t.THEATER_ID)
                  THEN 0 ELSE 1 END AS can_resize
        FROM Theaters t
        JOIN TheaterStatuses ts ON ts.theater_status_id = t.theater_status_id
        JOIN Cinemas c ON c.branch_id = t.branch_id
        JOIN Projectors p ON p.projector_id = t.projector_id
        WHERE t.theater_id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as {
        THEATER_ID: number;
        CINEMA: string;
        NUMBER_SEATS: number;
        DIMENSION_X: number;
        DIMENSION_Y: number;
        PROJECTOR_NAME: string;
        IS_ACTIVE: number;
        STATUS: string;
        CAN_RESIZE: number;
      }[];

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
        canResize: row.CAN_RESIZE === 1,
      };
    } catch (error) {
      this.logger.error('Error fetching theater by ID', error as Error);
      throw error;
    }
  }

  async updateTheater(
    id: number,
    updateTheaterDto: UpdateTheaterDto,
  ): Promise<TheaterWithLayoutPermission> {
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
          throw new NotFoundException('La sala seleccionada ya no existe.');
        }
        return theater;
      }

      const result = await this.db.transaction(async (connection) => {
        await this.syncSeatLayout(connection, id, updateTheaterDto);
        if (updateTheaterDto.projectorName !== undefined) {
          const projectorResult = await connection.execute(
            `SELECT projector_id FROM Projectors WHERE name = :projectorName`,
            { projectorName: updateTheaterDto.projectorName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          const projectorId = (
            projectorResult.rows as { PROJECTOR_ID: number }[] | undefined
          )?.[0]?.PROJECTOR_ID;

          if (projectorId == null) {
            throw new BadRequestException('Selecciona un proyector válido.');
          }

          binds.projectorId = projectorId;
        }

        if (updateTheaterDto.cinema !== undefined) {
          const cinemaResult = await connection.execute(
            `SELECT branch_id FROM Cinemas WHERE name = :cinema`,
            { cinema: updateTheaterDto.cinema },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          const branchId = (
            cinemaResult.rows as { BRANCH_ID: number }[] | undefined
          )?.[0]?.BRANCH_ID;

          if (branchId == null) {
            throw new BadRequestException('Selecciona una sucursal válida.');
          }

          binds.branchId = branchId;
        }

        if (updateTheaterDto.status !== undefined) {
          binds.theaterStatusId = await this.findStatusId(
            connection,
            updateTheaterDto.status,
          );
        }

        return connection.execute(
          `UPDATE Theaters SET ${setClauses.join(', ')} WHERE theater_id = :id`,
          binds,
        );
      });

      if (result.rowsAffected === 0) {
        throw new NotFoundException('La sala seleccionada ya no existe.');
      }

      const theater = await this.getTheaterById(id);
      if (!theater) {
        throw new NotFoundException('La sala seleccionada ya no existe.');
      }

      return theater;
    } catch (error) {
      this.logger.error('Error updating theater', error as Error);
      throw error;
    }
  }

  private async syncSeatLayout(
    connection: oracledb.Connection,
    id: number,
    dto: UpdateTheaterDto,
  ): Promise<void> {
    if (
      dto.dimensionX === undefined &&
      dto.dimensionY === undefined &&
      dto.numberOfSeats === undefined
    )
      return;

    // Projection creation locks this same row, so it cannot race a layout change.
    const snapshot = await connection.execute<{
      DIMENSION_X: number;
      DIMENSION_Y: number;
      NUMBER_SEATS: number;
    }>(
      'SELECT DIMENSION_X, DIMENSION_Y, NUMBER_SEATS FROM THEATERS WHERE THEATER_ID = :id FOR UPDATE WAIT 5',
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const current = snapshot.rows?.[0];
    if (!current)
      throw new NotFoundException('La sala seleccionada ya no existe.');
    const rows = dto.dimensionX ?? current.DIMENSION_X;
    const columns = dto.dimensionY ?? current.DIMENSION_Y;
    const quantity = dto.numberOfSeats ?? current.NUMBER_SEATS;
    if (quantity !== rows * columns) {
      throw new BadRequestException(
        'El número de asientos debe ser igual a filas por columnas.',
      );
    }

    const functions = await connection.execute<{ TOTAL: number }>(
      'SELECT COUNT(*) AS TOTAL FROM MOVIE_FUNCTIONS WHERE THEATER_ID = :id',
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (functions.rows?.[0]?.TOTAL !== 0) {
      if (
        rows !== current.DIMENSION_X ||
        columns !== current.DIMENSION_Y ||
        quantity !== current.NUMBER_SEATS
      ) {
        throw new ConflictException(
          'No puedes cambiar las dimensiones de una sala con funciones asociadas. Sus asientos e historial deben conservarse.',
        );
      }
      return;
    }
    await this.chairsRepository.synchronizeLayout(
      id,
      rows,
      columns,
      connection,
    );
  }

  async deleteTheater(id: number): Promise<void> {
    try {
      await this.db.transaction(async (conn) => {
        const result = await conn.execute(
          `UPDATE Theaters SET is_active = 0 WHERE theater_id = :id`,
          { id },
          { autoCommit: false },
        );

        if (result.rowsAffected === 0) {
          throw new NotFoundException('La sala seleccionada ya no existe.');
        }
      });
    } catch (error) {
      this.logger.error('Error deleting theater', error as Error);
      throw error;
    }
  }
}
