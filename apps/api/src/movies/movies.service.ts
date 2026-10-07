import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';
import { MoviesRepository } from './movies.repository';

@Injectable()
export class MoviesService {
  constructor(
    private readonly moviesRepository: MoviesRepository,
  ) {}

  async create(dto: CreateMovieDto) {
    return this.moviesRepository.create(dto);
  }

  async findAll() {
    return this.moviesRepository.findAll();
  }

  async findOne(id: number) {
    const movie = await this.moviesRepository.findOne(id);

    if (!movie ) {
      throw new NotFoundException(
        `Movie with ID ${id} was not found`,
      );
    }

    return movie;
  }

  async update(id: number, dto: UpdateMovieDto) {
    const movie = await this.moviesRepository.findOne(id);

    if (!movie ) {
      throw new NotFoundException(
        `Movie with ID ${id} was not found`,
      );
    }

    await this.moviesRepository.update(id, dto);

    return this.findOne(id);
  }

  async remove(id: number) {
    const movie = await this.moviesRepository.findOne(id);

    if (!movie ) {
      throw new NotFoundException(
        `Movie with ID ${id} was not found`,
      );
    }

    await this.moviesRepository.remove(id);

    return {
      message: `Movie ${id} deleted successfully`,
    };
  }

  findClassifications() {
    return this.moviesRepository.findClassifications();
  }

  findGenres() {
    return this.moviesRepository.findGenres();
  }

  findLanguages() {
    return this.moviesRepository.findLanguages();
  }
}
