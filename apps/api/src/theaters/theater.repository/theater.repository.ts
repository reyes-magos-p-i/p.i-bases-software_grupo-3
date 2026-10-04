import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Theater } from '../entities/theater.entity';

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
}
