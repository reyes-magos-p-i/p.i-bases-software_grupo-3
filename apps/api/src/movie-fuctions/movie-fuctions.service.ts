import { Injectable } from '@nestjs/common';

@Injectable()
export class MovieFuctionsService {
  findAll() {
    return `This action returns all movieFuctions`;
  }
}
