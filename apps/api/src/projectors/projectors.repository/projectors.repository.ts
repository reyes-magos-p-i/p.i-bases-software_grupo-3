import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Projector } from '../entities/projector.entity';

@Injectable()
export class ProjectorsRepository {
  private readonly logger = new Logger(ProjectorsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getProjectors(): Promise<Projector[]> {
    try {
      const result = await this.db.query(`
        SELECT projector_id, name
        FROM Projectors
        ORDER BY name
        FETCH FIRST 100 ROWS ONLY
      `);
      this.logger.log(`Fetched ${result.rows?.length ?? 0} projectors from the database.`);
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as { PROJECTOR_ID: number; NAME: string }[];

      return rows.map((row) => ({
        projectorId: row.PROJECTOR_ID,
        name: row.NAME,
      }));
    } catch (error) {
      this.logger.error('Error fetching projectors', error as Error);
      throw error;
    }
  }
}
