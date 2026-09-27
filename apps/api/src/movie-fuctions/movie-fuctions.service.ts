import { Injectable } from '@nestjs/common';
import { CreateMovieFuctionDto } from './dto/create-movie-fuction.dto';
import { UpdateMovieFuctionDto } from './dto/update-movie-fuction.dto';

@Injectable()
export class MovieFuctionsService {
  create(createMovieFuctionDto: CreateMovieFuctionDto) {
    return 'This action adds a new movieFuction';
  }

  findAll() {
    return `This action returns all movieFuctions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} movieFuction`;
  }

  update(id: number, updateMovieFuctionDto: UpdateMovieFuctionDto) {
    return `This action updates a #${id} movieFuction`;
  }

  remove(id: number) {
    return `This action removes a #${id} movieFuction`;
  }
}
