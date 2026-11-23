import {
  BadRequestException,
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
    assertPresaleBeforeRelease(dto.releaseDate ?? null, dto.presaleStart ?? null);
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

    // The rule applies to the dates the movie will have: the new ones, or the stored ones.
    assertPresaleBeforeRelease(
      dto.releaseDate === undefined ? movie.releaseDate : dto.releaseDate,
      dto.presaleStart === undefined ? movie.presaleStart : dto.presaleStart,
    );

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

// SCRUM-437: a presale needs a release date and must start before it (YYYY-MM-DD strings
// compare as dates). The database enforces the same rule (CK_MOVIES_PRESALE_BEFORE_RELEASE).
export function assertPresaleBeforeRelease(
  releaseDate: string | null,
  presaleStart: string | null,
): void {
  if (!presaleStart) return;
  if (!releaseDate)
    throw new BadRequestException(
      'Indica la fecha de estreno para programar la preventa.',
    );
  if (presaleStart >= releaseDate)
    throw new BadRequestException(
      'La preventa debe empezar antes de la fecha de estreno.',
    );
}
