import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
 
@Injectable()
export class HealthRepository {
  private readonly logger = new Logger('HealthRepository');
 
  constructor(private readonly db: DatabaseService) {}
 
  async checkDatabaseConnection(): Promise<boolean> {
    try {
      const result = await this.db.query('SELECT 1 FROM dual');
      return !!result.rows?.length;
    } catch (error) {
      this.logger.error('Error checking database connection:', error as Error);
      return false;
    }
  }
}
 