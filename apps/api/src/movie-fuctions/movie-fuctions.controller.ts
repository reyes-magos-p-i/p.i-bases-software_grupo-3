import { Controller, Get, Header } from '@nestjs/common';
import { MovieFuctionsService } from './movie-fuctions.service';

@Controller('movie-fuctions')
export class MovieFuctionsController {
  constructor(private readonly movieFuctionsService: MovieFuctionsService) {}
  @Get()
  findAll() {
    return this.movieFuctionsService.findAll();
  }
  @Get('catalog')
  @Header('Cache-Control', 'no-store')
  findCatalog() {
    return this.movieFuctionsService.findCatalog();
  }
}
