import { Injectable, NotFoundException } from '@nestjs/common';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';
import type { ListCinemasQueryDto } from './dto/list-cinemas-query.dto';

@Injectable()
export class CinemasService {
  constructor(private readonly cinemasRepository: CinemasRepository) {}

  findAll() {
    return this.cinemasRepository.getAllCinemas();
  }

  listCinemas(query: ListCinemasQueryDto) {
    return this.cinemasRepository.listCinemas(query);
  }

  listCompanies() {
    return this.cinemasRepository.listCompanies();
  }

  async getCinema(id: number) {
    const cinema = await this.cinemasRepository.findCinemaById(id);
    if (!cinema)
      throw new NotFoundException('La sucursal seleccionada no existe.');
    return cinema;
  }
}
