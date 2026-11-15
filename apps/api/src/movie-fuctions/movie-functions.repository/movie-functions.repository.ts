import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { HAS_FREE_SEAT } from '../../purchases/purchase-catalog.repository';
import type {
  MoviePreferenceCandidate,
  MoviePurchaseHistory,
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

  async getPurchaseHistory(clientId: number): Promise<MoviePurchaseHistory> {
    const result = await this.db.query<{
      kind: 'MOVIE' | 'GENRE' | 'LANGUAGE';
      id: number;
      purchaseCount: number;
    }>(
      `WITH purchases AS (
        SELECT i.INVOICE_ID, mf.MOVIE_ID
        FROM INVOICES i
        JOIN MOVIE_FUNCTIONS mf ON mf.MOVIE_FUNCTION_ID = i.MOVIE_FUNCTION_ID
        WHERE i.CLIENT_ID = :clientId AND i.STATUS = 'PAID'
          AND EXISTS (
            SELECT 1 FROM INVOICE_PRODUCTS ip
            JOIN PRODUCTS p ON p.PRODUCT_ID = ip.PRODUCT_ID
            WHERE ip.INVOICE_ID = i.INVOICE_ID
              AND p.PRODUCT_TYPE = 'TICKET' AND ip.QUANTITY > 0
          )
          AND (
            EXISTS (
              SELECT 1 FROM TICKETS tk
              JOIN MOVIE_FUNCTIONS current_mf ON current_mf.MOVIE_FUNCTION_ID = tk.MOVIE_FUNCTION_ID
              WHERE tk.INVOICE_ID = i.INVOICE_ID
                AND current_mf.STATUS IN ('ACTIVE', 'IN_PROGRESS', 'FINISHED')
            )
            OR (
              NOT EXISTS (SELECT 1 FROM TICKETS tk WHERE tk.INVOICE_ID = i.INVOICE_ID)
              AND mf.STATUS IN ('ACTIVE', 'IN_PROGRESS', 'FINISHED')
            )
          )
      ), affinities AS (
        SELECT 'MOVIE' AS kind, MOVIE_ID AS option_id, COUNT(DISTINCT INVOICE_ID) AS purchase_count
        FROM purchases GROUP BY MOVIE_ID
        UNION ALL
        SELECT 'GENRE', mg.GENRE_ID, COUNT(DISTINCT p.INVOICE_ID)
        FROM purchases p JOIN MOVIE_GENRES mg ON mg.MOVIE_ID = p.MOVIE_ID
        GROUP BY mg.GENRE_ID
        UNION ALL
        SELECT 'LANGUAGE', ml.LANGUAGE_ID, COUNT(DISTINCT p.INVOICE_ID)
        FROM purchases p JOIN MOVIE_LANGUAGES ml ON ml.MOVIE_ID = p.MOVIE_ID
        GROUP BY ml.LANGUAGE_ID
      )
      SELECT kind AS "kind", option_id AS "id", purchase_count AS "purchaseCount"
      FROM affinities ORDER BY kind, option_id`,
      { clientId },
    );
    const history: MoviePurchaseHistory = {
      purchasedMovieIds: [],
      genres: [],
      languages: [],
    };
    for (const row of result.rows ?? []) {
      if (row.kind === 'MOVIE') history.purchasedMovieIds.push(row.id);
      if (row.kind === 'GENRE')
        history.genres.push({ id: row.id, purchaseCount: row.purchaseCount });
      if (row.kind === 'LANGUAGE')
        history.languages.push({
          id: row.id,
          purchaseCount: row.purchaseCount,
        });
    }
    return history;
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
          WHERE mf.start_time > CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS TIMESTAMP) AND mf.status = 'ACTIVE' AND t.is_active = 1 AND ci.status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM CINEMA_MOVIES cm WHERE cm.MOVIE_ID=mf.MOVIE_ID AND cm.BRANCH_ID=t.BRANCH_ID AND cm.IS_AVAILABLE=1)
            AND ${HAS_FREE_SEAT}
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
