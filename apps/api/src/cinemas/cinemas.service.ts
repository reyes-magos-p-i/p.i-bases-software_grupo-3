import { Injectable } from '@nestjs/common';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

@Injectable()
export class CinemasService {
  constructor(private readonly cinemasRepository: CinemasRepository) {}

  findAll() {
    return this.cinemasRepository.getAllCinemas();
  }
}
