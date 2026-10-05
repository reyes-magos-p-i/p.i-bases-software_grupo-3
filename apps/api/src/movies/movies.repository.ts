import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
//import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';

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

    return result.rows?.[0] ?? null;
  }

}
