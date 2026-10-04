import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Theater } from '../entities/theater.entity';
import { CreateTheaterDto } from '../dto/create-theater.dto';
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
}
