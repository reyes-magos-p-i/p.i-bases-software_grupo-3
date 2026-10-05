import { Injectable } from '@nestjs/common';
import { CreateTheaterDto } from './dto/create-theater.dto';
import { UpdateTheaterDto } from './dto/update-theater.dto';
import { TheaterRepository } from './theater.repository/theater.repository';

@Injectable()
export class TheatersService {
  constructor(private readonly theatersRepository: TheaterRepository) {}
  create(createTheaterDto: CreateTheaterDto) {
    return this.theatersRepository.createTheater(createTheaterDto);
  }

  findAll() {
    return this.theatersRepository.getAllTheaters();
  }

  findOne(id: number) {
    return this.theatersRepository.getTheaterById(id);
  }

  update(id: number, updateTheaterDto: UpdateTheaterDto) {
    return this.theatersRepository.updateTheater(id, updateTheaterDto);
  }

  remove(id: number) {
    return `This action removes a #${id} theater`;
  }
}
