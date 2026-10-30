import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type {
  MoviePreferenceCandidate,
  UpcomingMovieFunction,
} from '../entities/upcoming-movie-functions.interface';

@Injectable()
export class MovieFunctionsRepository {
  private readonly logger = new Logger(MovieFunctionsRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async getMovieFunctions(): Promise<UpcomingMovieFunction[]> {
    const movies = await this.getCatalogCandidates();
    return movies
      .slice(0, 4)
      .map(({ title, posterImage }) => ({ title, posterImage }));
  }

  async getCatalogCandidates(): Promise<MoviePreferenceCandidate[]> {
    try {
      const result = await this.db.query<{
        id: number;
        title: string;
        posterImage: string;
        kind: 'GENRE' | 'LANGUAGE' | null;
        optionId: number | null;
      }>(`
        WITH upcoming AS (
          SELECT mf.movie_id, MIN(mf.start_time) AS next_start
          FROM Movie_functions mf
          JOIN Theaters t ON t.theater_id = mf.theater_id
          JOIN Cinemas ci ON ci.branch_id = t.branch_id
          JOIN Companies co ON co.company_id = ci.company_id
          WHERE mf.start_time > SYSTIMESTAMP AND mf.status = 'ACTIVE'
          GROUP BY mf.movie_id
        ), associations AS (
          SELECT movie_id, 'GENRE' AS kind, genre_id AS option_id FROM Movie_genres
          UNION ALL
          SELECT movie_id, 'LANGUAGE', language_id FROM Movie_languages
        )
        SELECT m.movie_id AS "id", m.title AS "title", m.poster_image AS "posterImage",
               a.kind AS "kind", a.option_id AS "optionId"
        FROM upcoming u JOIN Movies m ON m.movie_id = u.movie_id
        LEFT JOIN associations a ON a.movie_id = m.movie_id
        ORDER BY u.next_start, m.movie_id, a.kind, a.option_id
      `);
      const movies = new Map<number, MoviePreferenceCandidate>();
      for (const row of result.rows ?? []) {
        let movie = movies.get(row.id);
        if (!movie) {
          movie = {
            id: row.id,
            title: row.title,
            posterImage: row.posterImage,
            genreIds: [],
            languageIds: [],
          };
          movies.set(row.id, movie);
        }
        if (row.optionId === null) continue;
        if (row.kind === 'GENRE') movie.genreIds.push(row.optionId);
        if (row.kind === 'LANGUAGE') movie.languageIds.push(row.optionId);
      }
      return [...movies.values()];
    } catch (error) {
      this.logger.error(
        'Error fetching upcoming movie functions',
        error as Error,
      );
      throw error;
    }
  }
}
