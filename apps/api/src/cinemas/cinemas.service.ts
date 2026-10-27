import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';
import type { ListCinemasQueryDto } from './dto/list-cinemas-query.dto';
import type { CreateCinemaDto } from './dto/create-cinema.dto';

const COMPANY_REQUIRED = 'Debe seleccionar una compañía';
const NAME_TAKEN = 'Ya existe una sucursal activa con ese nombre';

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

  async createCinema(data: CreateCinemaDto) {
    const id = await this.cinemasRepository.createCinema(data);
    if (id === 'company') throw new BadRequestException(COMPANY_REQUIRED);
    if (id === 'duplicate') throw new ConflictException(NAME_TAKEN);
    return this.getCinema(id);
  }
}
