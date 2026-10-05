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
        ID_PELICULA,
        TITULO,
        DESCRIPCION,
        DURACION,
        FECHA_ESTRENO,
        CLASIFICACION,
        DIRECTOR,
        IMAGEN_URL
      FROM PELICULA
      ORDER BY TITULO
    `);

    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(
      `
      SELECT
        ID_PELICULA,
        TITULO,
        DESCRIPCION,
        DURACION,
        FECHA_ESTRENO,
        CLASIFICACION,
        DIRECTOR,
        IMAGEN_URL
      FROM PELICULA
      WHERE ID_PELICULA = :id
      `,
      { id },
    );

    return result.rows?.[0] ?? null;
  }

  async create(dto: CreateMovieDto) {
    await this.db.query(
      `
      INSERT INTO PELICULA (
        TITULO,
        DESCRIPCION,
        DURACION,
        FECHA_ESTRENO,
        CLASIFICACION,
        DIRECTOR,
        IMAGEN_URL
      )
      VALUES (
        :titulo,
        :descripcion,
        :duracion,
        :fechaEstreno,
        :clasificacion,
        :director,
        :imagenUrl
      )
      `,
      {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        duracion: dto.duracion,
        fechaEstreno: dto.fechaEstreno,
        clasificacion: dto.clasificacion,
        director: dto.director,
        imagenUrl: dto.imagenUrl,
      },
    );
  }

}
