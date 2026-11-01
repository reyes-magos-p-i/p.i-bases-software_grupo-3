import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UpcomingMovieFunction } from '../entities/upcoming-movie-functions.interface';

@Injectable()
export class MovieFunctionsRepository {
  private readonly logger = new Logger(MovieFunctionsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getMovieFunctions(): Promise<UpcomingMovieFunction[]> {
    try {
      const result = await this.db.query(`
        SELECT
            m.title        AS "title",
            m.poster_image AS "posterImage"
        FROM Movie_functions mf
        JOIN Movies    m  ON m.movie_id    = mf.movie_id
        JOIN Theaters  t  ON t.theater_id  = mf.theater_id
        JOIN Cinemas   ci ON ci.branch_id  = t.branch_id
        JOIN Companies co ON co.company_id = ci.company_id
        WHERE mf.start_time > SYSTIMESTAMP
        GROUP BY
            ci.name,
            co.name,
            m.movie_id,
            m.title,
            m.running_time,
            m.poster_image
        ORDER BY MIN(mf.start_time), ci.name
        FETCH FIRST 4 ROWS ONLY
      `);

      const rows = result.rows ?? [];

      return rows.map((row: any) => ({
        title: row.title,
        posterImage: row.posterImage,
      }));
    } catch (error) {
      this.logger.error('Error fetching upcoming movie functions', error as Error);
      throw error;
    }
  }
}