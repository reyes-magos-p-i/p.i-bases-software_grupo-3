import { Injectable, NotFoundException } from '@nestjs/common';
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
      m.POSTER_IMAGE,
      TO_CHAR(m.RELEASE_DATE, 'YYYY-MM-DD') AS RELEASE_DATE,
      TO_CHAR(m.PRESALE_START, 'YYYY-MM-DD') AS PRESALE_START,
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

    // Separate query so the branches don't multiply the language and genre rows.
    const branches = await this.db.query<{ id: number; name: string }>(
      `
      SELECT c.BRANCH_ID AS "id", TRIM(c.NAME) AS "name"
      FROM CINEMA_MOVIES cm
      JOIN CINEMAS c ON c.BRANCH_ID = cm.BRANCH_ID
      WHERE cm.MOVIE_ID = :id AND cm.IS_AVAILABLE = 1 AND c.STATUS = 'ACTIVE'
      ORDER BY c.NAME
      `,
      { id },
    );

    return {
      id: first.MOVIE_ID,
      title: first.TITLE,
      synopsis: first.SYNOPSIS,
      runningTime: first.RUNNING_TIME,
      releaseYear: first.RELEASE_YEAR,
      posterImage: first.POSTER_IMAGE ?? null,
      releaseDate: first.RELEASE_DATE ?? null,
      presaleStart: first.PRESALE_START ?? null,
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

      branches: branches.rows ?? [],
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
        CLASSIFICATION_ID,
        RELEASE_DATE,
        PRESALE_START
      )
      VALUES (
        :title,
        :runningTime,
        :releaseYear,
        :synopsis,
        :posterImage,
        :classificationId,
        TO_DATE(:releaseDate, 'YYYY-MM-DD'),
        TO_DATE(:presaleStart, 'YYYY-MM-DD')
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
        releaseDate: dto.releaseDate ?? null,
        presaleStart: dto.presaleStart ?? null,

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

    if (dto.branchIds?.length) {
      await conn.executeMany(
        `
        INSERT INTO CINEMA_MOVIES (BRANCH_ID, MOVIE_ID, IS_AVAILABLE)
        VALUES (:branchId, :movieId, 1)
        `,
        dto.branchIds.map((branchId) => ({ branchId, movieId })),
      );
    }

    return movieId;
  });
}

  async remove(id: number) {
  return this.db.transaction(async (conn) => {
     await conn.execute('ALTER SESSION DISABLE PARALLEL DML');

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
      DELETE FROM CINEMA_MOVIES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    await conn.execute(
      `
      DELETE
      FROM MOVIES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );
  });
}

  async update(id: number, dto: UpdateMovieDto): Promise<void> {
    await this.db.transaction(async (conn) => {
      // Run before modifying data on this connection.
      await conn.execute('ALTER SESSION DISABLE PARALLEL DML');

      const result = await conn.execute(
        `
        UPDATE MOVIES
        SET
          TITLE = COALESCE(:title, TITLE),
          SYNOPSIS = COALESCE(:synopsis, SYNOPSIS),
          POSTER_IMAGE = COALESCE(:posterImage, POSTER_IMAGE),
          RUNNING_TIME = COALESCE(:runningTime, RUNNING_TIME),
          RELEASE_YEAR = COALESCE(:releaseYear, RELEASE_YEAR),
          CLASSIFICATION_ID =
            COALESCE(:classificationId, CLASSIFICATION_ID),
          -- Dates can be cleared: absent keeps them, null clears them.
          RELEASE_DATE = CASE WHEN :releaseDateSent = 1
            THEN TO_DATE(:releaseDate, 'YYYY-MM-DD') ELSE RELEASE_DATE END,
          PRESALE_START = CASE WHEN :presaleStartSent = 1
            THEN TO_DATE(:presaleStart, 'YYYY-MM-DD') ELSE PRESALE_START END
        WHERE MOVIE_ID = :id
        `,
        {
          id,
          title: dto.title ?? null,
          synopsis: dto.synopsis ?? null,
          posterImage: dto.posterImage ?? null,
          runningTime: dto.runningTime ?? null,
          releaseYear: dto.releaseYear ?? null,
          classificationId: dto.classificationId ?? null,
          releaseDateSent: dto.releaseDate === undefined ? 0 : 1,
          releaseDate: dto.releaseDate ?? null,
          presaleStartSent: dto.presaleStart === undefined ? 0 : 1,
          presaleStart: dto.presaleStart ?? null,
        },
        { autoCommit: false },
      );

      if (result.rowsAffected === 0) {
        throw new NotFoundException(`Movie with ID ${id} was not found`);
      }

      if (dto.languageIds !== undefined) {
        const languageIds = [...new Set(dto.languageIds)];

        await conn.execute(
          `
          DELETE FROM MOVIE_LANGUAGES
          WHERE MOVIE_ID = :id
          `,
          { id },
          { autoCommit: false },
        );

        if (languageIds.length > 0) {
          await conn.executeMany(
            `
            INSERT INTO MOVIE_LANGUAGES (MOVIE_ID, LANGUAGE_ID)
            VALUES (:id, :languageId)
            `,
            languageIds.map((languageId) => ({
              id,
              languageId,
            })),
            { autoCommit: false },
          );
        }
      }

      if (dto.genreIds !== undefined) {
        const genreIds = [...new Set(dto.genreIds)];

        await conn.execute(
          `
          DELETE FROM MOVIE_GENRES
          WHERE MOVIE_ID = :id
          `,
          { id },
          { autoCommit: false },
        );

        if (genreIds.length > 0) {
          await conn.executeMany(
            `
            INSERT INTO MOVIE_GENRES (MOVIE_ID, GENRE_ID)
            VALUES (:id, :genreId)
            `,
            genreIds.map((genreId) => ({
              id,
              genreId,
            })),
            { autoCommit: false },
          );
        }
      }

      if (dto.branchIds !== undefined) {
        // Availability is a flag, not a row: unselected active branches are turned off
        // (inactive branches keep their value) and selected ones are turned on or added.
        await conn.execute(
          `
          UPDATE CINEMA_MOVIES cm
          SET IS_AVAILABLE = 0
          WHERE cm.MOVIE_ID = :id AND cm.IS_AVAILABLE = 1
            AND EXISTS (SELECT 1 FROM CINEMAS c
                        WHERE c.BRANCH_ID = cm.BRANCH_ID AND c.STATUS = 'ACTIVE')
          `,
          { id },
          { autoCommit: false },
        );

        const branchIds = [...new Set(dto.branchIds)];

        if (branchIds.length > 0) {
          await conn.executeMany(
            `
            MERGE INTO CINEMA_MOVIES cm
            USING (SELECT :branchId AS BRANCH_ID, :id AS MOVIE_ID FROM DUAL) s
            ON (cm.BRANCH_ID = s.BRANCH_ID AND cm.MOVIE_ID = s.MOVIE_ID)
            WHEN MATCHED THEN UPDATE SET cm.IS_AVAILABLE = 1
            WHEN NOT MATCHED THEN
              INSERT (BRANCH_ID, MOVIE_ID, IS_AVAILABLE)
              VALUES (s.BRANCH_ID, s.MOVIE_ID, 1)
            `,
            branchIds.map((branchId) => ({ id, branchId })),
            { autoCommit: false },
          );
        }
      }
    });
  }

  async findClassifications() {
    const result = await this.db.query<{
      id: number;
      name: string;
    }>(`
      SELECT
        CLASSIFICATION_ID AS "id",
        CLASSIFICATION_NAME AS "name"
      FROM CLASSIFICATIONS
      ORDER BY CLASSIFICATION_NAME
    `);

    return result.rows ?? [];
  }

  async findGenres() {
    const result = await this.db.query<{
      id: number;
      name: string;
    }>(`
      SELECT
        GENRE_ID AS "id",
        NAME AS "name"
      FROM GENRES
      ORDER BY NAME
    `);

    return result.rows ?? [];
  }

  async findLanguages() {
    const result = await this.db.query<{
      id: number;
      name: string;
    }>(`
      SELECT
        LANGUAGE_ID AS "id",
        NAME AS "name"
      FROM LANGUAGES
      ORDER BY NAME
    `);

    return result.rows ?? [];
  }

  async findBranches() {
    const result = await this.db.query<{
      id: number;
      name: string;
    }>(`
      SELECT
        BRANCH_ID AS "id",
        TRIM(NAME) AS "name"
      FROM CINEMAS
      WHERE STATUS = 'ACTIVE'
      ORDER BY NAME
    `);

    return result.rows ?? [];
  }

}
