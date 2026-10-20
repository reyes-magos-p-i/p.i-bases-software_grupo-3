import { Injectable } from '@nestjs/common';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

@Injectable()
export class MovieFuctionsService {
  constructor(private readonly MovieFunctionsRepository: MovieFunctionsRepository) {}

  findAll() {
    return this.MovieFunctionsRepository.getMovieFunctions();
  }
}
