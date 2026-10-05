import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';

@Injectable()
  export class MoviesRepository {
    constructor( private readonly db: DatabaseService,

    ){}

 async findAll() {
    const result = await this.db.query(`
      SELECT
        MOVIE_ID,
        TITLE,
        RUNNING_TIME,
        SYNOPSIS,
        POSTER_IMAGE,
        RELEASE_YEAR,
        CLASIFICATION_ID,
      FROM MOVIES
      ORDER BY TITLE
    `);

    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(
      `
      SELECT
        MOVIE_ID,
        TITLE,
        RUNNING_TIME,
        SYNOPSIS,
        POSTER_IMAGE,
        RELEASE_YEAR,
        CLASIFICATION_ID,
      FROM MOVIES
      WHERE MOVIE_ID = :id
      `,
      { id },
    );

    return result.rows?.[0] ?? null;
  }

  async create(dto: CreateMovieDto) {
    await this.db.query(
      `
      INSERT INTO PELICULA (
        TITLE,
        RUNNING_TIME,
        SYNOPSIS,
        POSTER_IMAGE,
        RELEASE_YEAR,
        CLASIFICATION_ID,
      )
      VALUES (
        :title,
        :runningTime,
        :synopsis,
        :poster_image,
        :releaseYear,
        :clasification
      )
      `,
      {
        title:dto.title,
        runningTime:dto.runningTime,
        synopsis:dto.synopsis,
        poster_image:dto.poster_image,
        releaseYear:dto.releaseYear,
        clasification:dto.clasification
      },
    );
  }

}
