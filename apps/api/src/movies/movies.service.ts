import { Injectable } from '@nestjs/common';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';
import { MoviesRepository } from './movies.repository';

@Injectable()
export class MoviesService {
    constructor(
    private readonly moviesRepository: MoviesRepository,
  ) {}

  create(dto: CreateMovieDto) {
    return this.moviesRepository.create(dto);
  }

  findAll() {
    return this.moviesRepository.findAll();
  }

  findOne(id: number) {
    return this.moviesRepository.findOne(id);
  }

  update(id: number, dto: UpdateMovieDto) {
    return this.moviesRepository.update(id, dto);
  }

  remove(id: number) {
    return this.moviesRepository.remove(id);
  }

}
