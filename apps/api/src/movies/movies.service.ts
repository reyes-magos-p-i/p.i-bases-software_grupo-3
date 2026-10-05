import { Injectable, NotFoundException} from '@nestjs/common';
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

  async findAll() {
    return this.moviesRepository.findAll();
  }

  async findOne(id: number) {
    const movie = await this.moviesRepository.findOne(id);

    if (!movie) {
      throw new NotFoundException(`Movie with ID ${id} was not found`);
    }

    return movie;
  }

  update(id: number, dto: UpdateMovieDto) {
    return this.moviesRepository.update(id, dto);
  }

  remove(id: number) {
    return this.moviesRepository.remove(id);
  }

}
