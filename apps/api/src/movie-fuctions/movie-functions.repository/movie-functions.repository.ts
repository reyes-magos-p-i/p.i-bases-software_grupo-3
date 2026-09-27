import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MovieFunction } from '../entities/movie-function.entity';

@Injectable()
export class MovieFunctionsRepository {
  private readonly logger = new Logger(MovieFunctionsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getMovieFunctions(): Promise<MovieFunction[]> {
    try {
      const result = await this.db.query(``);

      const rows = result.rows ?? [];

      return rows.map((row: any) => {
        const movieFunction = new MovieFunction();
        movieFunction.movieFunctionId = Number(row.movieFunctionId);
        movieFunction.movieId = Number(row.movieId);
        movieFunction.theaterId = Number(row.theaterId);
        movieFunction.startTime = row.startTime;
        movieFunction.endTime = row.endTime;
        movieFunction.screeningDate = row.screeningDate;
        movieFunction.createdBy = Number(row.createdBy);
        return movieFunction;
      });
    } catch (error) {
      this.logger.error('Error fetching movie functions', error as Error);
      throw error;
    }
  }
}