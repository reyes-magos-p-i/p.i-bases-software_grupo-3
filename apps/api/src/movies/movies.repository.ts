import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';
import * as oracledb from 'oracledb';

@Injectable()
  export class MoviesRepository {
    constructor( private readonly db: DatabaseService,

    ){}

  async findAll() {
    const result = await this.db.query<any>(
      `
      SELECT
        m.MOVIE_ID,
        m.TITLE,
        m.RUNNING_TIME,
        m.RELEASE_YEAR,
        c.CLASSIFICATION_NAME AS CLASSIFICATION

      FROM MOVIES m

      JOIN CLASSIFICATIONS c
        ON m.CLASSIFICATION_ID = c.CLASSIFICATION_ID

      ORDER BY m.TITLE
      `,
    );

    const rows = result.rows ?? [];

    return rows.map((row: any) => ({
      id: row.MOVIE_ID,
      title: row.TITLE,
      runningTime: row.RUNNING_TIME,
      releaseYear: row.RELEASE_YEAR,
      classification: row.CLASSIFICATION,
    }));
  }

  async findOne(id: number) {
  const result = await this.db.query<any>(
    `
    SELECT
      m.MOVIE_ID,
      m.TITLE,
      m.SYNOPSIS,
      m.RUNNING_TIME,
      m.RELEASE_YEAR,

      c.CLASSIFICATION_ID,
      c.CLASSIFICATION_NAME AS CLASSIFICATION,

      l.LANGUAGE_ID,
      l.NAME AS LANGUAGE,

      g.GENRE_ID,
      g.NAME AS GENRE

    FROM MOVIES m

    JOIN CLASSIFICATIONS c
      ON m.CLASSIFICATION_ID = c.CLASSIFICATION_ID

    LEFT JOIN MOVIE_LANGUAGES ml
      ON m.MOVIE_ID = ml.MOVIE_ID

    LEFT JOIN LANGUAGES l
      ON ml.LANGUAGE_ID = l.LANGUAGE_ID

    LEFT JOIN MOVIE_GENRES mg
      ON m.MOVIE_ID = mg.MOVIE_ID

    LEFT JOIN GENRES g
      ON mg.GENRE_ID = g.GENRE_ID

    WHERE m.MOVIE_ID = :id
    `,
    { id },
    );

    const rows = result.rows ?? [];

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];

    return {
      id: first.MOVIE_ID,
      title: first.TITLE,
      synopsis: first.SYNOPSIS,
      runningTime: first.RUNNING_TIME,
      releaseYear: first.RELEASE_YEAR,

      classification: {
        id: first.CLASSIFICATION_ID,
        name: first.CLASSIFICATION,
      },

      languages: [
        ...new Map(
          rows
            .filter((row: any) => row.LANGUAGE_ID)
            .map((row: any) => [
              row.LANGUAGE_ID,
              {
                id: row.LANGUAGE_ID,
                name: row.LANGUAGE,
              },
            ]),
        ).values(),
      ],

      genres: [
        ...new Map(
          rows
            .filter((row: any) => row.GENRE_ID)
            .map((row: any) => [
              row.GENRE_ID,
              {
                id: row.GENRE_ID,
                name: row.GENRE,
              },
            ]),
        ).values(),
      ],
    };
  }

  async create(dto: CreateMovieDto) {
  return this.db.transaction(async (conn) => {
    const result = await conn.execute(
      `
      INSERT INTO MOVIES (
        TITLE,
        RUNNING_TIME,
        RELEASE_YEAR,
        SYNOPSIS,
        POSTER_IMAGE,
        CLASIFICATION_ID
      )
      VALUES (
        :title,
        :runningTime,
        :releaseYear,
        :synopsis,
        :posterImage,
        :classificationId
      )
      RETURNING MOVIE_ID INTO :movieId
      `,
      {
        title: dto.title,
        runningTime: dto.runningTime,
        releaseYear: dto.releaseYear,
        synopsis: dto.synopsis,
        posterImage: dto.posterImage,
        classificationId: dto.classificationId,

        movieId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      },
    );

    const outBinds = result.outBinds as {
      movieId: number[];
    };

    const movieId = outBinds.movieId[0];

    if (dto.languageIds.length > 0) {
      const languageBinds = dto.languageIds.map((languageId) => ({
        movieId,
        languageId,
      }));

      await conn.executeMany(
        `
        INSERT INTO MOVIE_LANGUAGES (
          MOVIE_ID,
          LANGUAGE_ID
        )
        VALUES (
          :movieId,
          :languageId
        )
        `,
        languageBinds,
      );
    }

    if (dto.genreIds.length > 0) {
      const genreBinds = dto.genreIds.map((genreId) => ({
        movieId,
        genreId,
      }));

      await conn.executeMany(
        `
        INSERT INTO MOVIE_GENRES (
          MOVIE_ID,
          GENRE_ID
        )
        VALUES (
          :movieId,
          :genreId
        )
        `,
        genreBinds,
      );
    }

    return movieId;
  });
}

  async remove(id: number) {
  return this.db.transaction(async (conn) => {
    await conn.execute(
      `
      DELETE FROM MOVIE_GENRES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    await conn.execute(
      `
      DELETE FROM MOVIE_LANGUAGES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    await conn.execute(
      `
      DELETE FROM MOVIES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );
  });
}

  async update(id: number, dto: UpdateMovieDto) {
    return this.db.transaction(async (conn) => {
      await conn.execute(
        `
        UPDATE MOVIES
        SET
          TITLE = COALESCE(:title, TITLE),
          RUNNING_TIME = COALESCE(:runningTime, RUNNING_TIME),
          RELEASE_YEAR = COALESCE(:releaseYear, RELEASE_YEAR),
          CLASIFICATION_ID =
            COALESCE(:classificationId, CLASIFICATION_ID)
        WHERE MOVIE_ID = :id
        `,
        {
          id,
          title: dto.title ?? null,
          runningTime: dto.runningTime ?? null,
          releaseYear: dto.releaseYear ?? null,
          classificationId: dto.classificationId ?? null,
        },
      );

      if (dto.languageIds) {
        await conn.execute(
          `
          DELETE FROM MOVIE_LANGUAGES
          WHERE MOVIE_ID = :id
          `,
          { id },
        );

        if (dto.languageIds.length > 0) {
          await conn.executeMany(
            `
            INSERT INTO MOVIE_LANGUAGES (
              MOVIE_ID,
              LANGUAGE_ID
            )
            VALUES (
              :id,
              :languageId
            )
            `,
            dto.languageIds.map((languageId) => ({
              id,
              languageId,
            })),
          );
        }
      }

      if (dto.genreIds) {
        await conn.execute(
          `
          DELETE FROM MOVIE_GENRES
          WHERE MOVIE_ID = :id
          `,
          { id },
        );

        if (dto.genreIds.length > 0) {
          await conn.executeMany(
            `
            INSERT INTO MOVIE_GENRES (
              MOVIE_ID,
              GENRE_ID
            )
            VALUES (
              :id,
              :genreId
            )
            `,
            dto.genreIds.map((genreId) => ({
              id,
              genreId,
            })),
          );
        }
      }
    });
  }

}
