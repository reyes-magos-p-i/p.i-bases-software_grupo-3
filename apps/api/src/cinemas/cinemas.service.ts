import { Injectable } from '@nestjs/common';
import { CreateCinemaDto } from './dto/create-cinema.dto';
import { UpdateCinemaDto } from './dto/update-cinema.dto';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

@Injectable()
export class CinemasService {
  constructor(private readonly cinemasRepository: CinemasRepository) {}

  findAll() {
    return this.cinemasRepository.getAllCinemas();
  }
}
