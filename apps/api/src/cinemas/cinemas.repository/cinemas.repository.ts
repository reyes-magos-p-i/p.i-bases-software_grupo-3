import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Cinema } from '../entities/cinema.entity';

@Injectable()
export class CinemasRepository {
  private readonly logger = new Logger(CinemasRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getAllCinemas(): Promise<Cinema[]> {
    try {
      const result = await this.db.query(`
        SELECT branch_id, name, company_id
        FROM Cinemas
        ORDER BY name
      `);
      this.logger.log(`Fetched ${result.rows?.length ?? 0} cinemas from the database.`);
      this.logger.debug(`Database query result: ${JSON.stringify(result)}`);

      const rows = (result.rows ?? []) as { BRANCH_ID: number; NAME: string; COMPANY_ID: number }[];

      return rows.map((row) => ({
        branchId: row.BRANCH_ID,
        name: row.NAME,
        companyId: row.COMPANY_ID,
      }));
    } catch (error) {
      this.logger.error('Error fetching cinemas', error as Error);
      throw error;
    }
  }
}
