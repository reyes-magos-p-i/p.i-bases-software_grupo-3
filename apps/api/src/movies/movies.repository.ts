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
    const result = await this.db.query(`
      SELECT
          m.MOVIE_ID,
          m.TITLE,
          m.RUNNING_TIME,
          m.RELEASE_YEAR,
          c.CLASSIFICATION_NAME,
          l.NAME AS LANGUAGE_NAME,
          g.NAME AS GENRE_NAME
      FROM
          MOVIES m
      LEFT JOIN
          CLASSIFICATION c ON m.CLASSIFICATION_ID = c.CLASSIFICATION_ID
      LEFT JOIN
          MOVIE_LANGUAGE ml ON m.MOVIE_ID = ml.MOVIE_ID
      LEFT JOIN
          LANGUAGES l ON ml.LANGUAGE_ID = l.LANGUAGE_ID
      LEFT JOIN
          MOVIE_GENRE mg ON m.MOVIE_ID = mg.MOVIE_ID
      LEFT JOIN
          GENRE g ON mg.GENRE_ID = g.GENRE_ID
    `);

    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(
      `
      SELECT
          m.MOVIE_ID,
          m.TITLE,
          m.RUNNING_TIME,
          m.RELEASE_YEAR,
          c.CLASSIFICATION_NAME,
          l.NAME AS LANGUAGE_NAME,
          g.NAME AS GENRE_NAME
      FROM
          MOVIES m
      LEFT JOIN
          CLASSIFICATION c ON m.CLASSIFICATION_ID = c.CLASSIFICATION_ID
      LEFT JOIN
          MOVIE_LANGUAGE ml ON m.MOVIE_ID = ml.MOVIE_ID
      LEFT JOIN
          LANGUAGES l ON ml.LANGUAGE_ID = l.LANGUAGE_ID
      LEFT JOIN
          MOVIE_GENRE mg ON m.MOVIE_ID = mg.MOVIE_ID
      LEFT JOIN
          GENRE g ON mg.GENRE_ID = g.GENRE_ID
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    return result.rows ?? [];
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

    for (const languageId of dto.languageIds) {
      await conn.execute(
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
        {
          movieId,
          languageId,
        },
      );
    }

    for (const genreId of dto.genreIds) {
      await conn.execute(
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
        {
          movieId,
          genreId,
        },
      );
    }

    return movieId;
  });
}

  async remove(id: number) {
  return this.db.transaction(async (conn) => {
    await conn.execute(
      `
      DELETE FROM MOVIE_GENRE
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    await conn.execute(
      `
      DELETE FROM MOVIE_LANGUAGE
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
        DELETE FROM MOVIE_LANGUAGE
        WHERE MOVIE_ID = :id
        `,
        { id },
      );

      for (const languageId of dto.languageIds) {
        await conn.execute(
          `
          INSERT INTO MOVIE_LANGUAGE (
            MOVIE_ID,
            LANGUAGE_ID
          )
          VALUES (
            :id,
            :languageId
          )
          `,
          {
            id,
            languageId,
          },
        );
      }
    }

    if (dto.genreIds) {
      await conn.execute(
        `
        DELETE FROM MOVIE_GENRE
        WHERE MOVIE_ID = :id
        `,
        { id },
      );

      for (const genreId of dto.genreIds) {
        await conn.execute(
          `
          INSERT INTO MOVIE_GENRE (
            MOVIE_ID,
            GENRE_ID
          )
          VALUES (
            :id,
            :genreId
          )
          `,
          {
            id,
            genreId,
          },
        );
      }
    }
  });
}

}
