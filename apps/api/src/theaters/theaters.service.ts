import { BadRequestException, Injectable} from '@nestjs/common';
import { CreateTheaterDto } from './dto/create-theater.dto';
import { UpdateTheaterDto } from './dto/update-theater.dto';
import { TheaterRepository } from './theater.repository/theater.repository';

@Injectable()
export class TheatersService {
  constructor(private readonly theatersRepository: TheaterRepository) {}

  private validateSeatDimensions(numberOfSeats: number, dimensionX: number, dimensionY: number) {
    if (
      !Number.isInteger(numberOfSeats) ||
      numberOfSeats < 1 ||
      numberOfSeats > 5000 ||
      !Number.isInteger(dimensionX) ||
      dimensionX < 1 ||
      !Number.isInteger(dimensionY) ||
      dimensionY < 1 ||
      numberOfSeats !== dimensionX * dimensionY
    ) {
      throw new BadRequestException('Invalid theater seat dimensions');
    }
  }

  async create(createTheaterDto: CreateTheaterDto) {
    this.validateSeatDimensions(
      createTheaterDto.numberOfSeats,
      createTheaterDto.dimensionX,
      createTheaterDto.dimensionY,
    );
    return this.theatersRepository.createTheater(createTheaterDto);
  }

  findAll() {
    return this.theatersRepository.getAllTheaters();
  }

  findOne(id: number) {
    return this.theatersRepository.getTheaterById(id);
  }

  async update(id: number, updateTheaterDto: UpdateTheaterDto) {
    if (
      updateTheaterDto.numberOfSeats !== undefined ||
      updateTheaterDto.dimensionX !== undefined ||
      updateTheaterDto.dimensionY !== undefined
    ) {
      const theater = await this.theatersRepository.getTheaterById(id);
      if (theater) {
        this.validateSeatDimensions(
          updateTheaterDto.numberOfSeats ?? theater.numberOfSeats,
          updateTheaterDto.dimensionX ?? theater.dimensionX,
          updateTheaterDto.dimensionY ?? theater.dimensionY,
        );
      }
    }

    return this.theatersRepository.updateTheater(id, updateTheaterDto);
  }

  remove(id: number) {
    return this.theatersRepository.deleteTheater(id);
  }
}
