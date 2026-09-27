import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MovieFuctionsService } from './movie-fuctions.service';
import { CreateMovieFuctionDto } from './dto/create-movie-fuction.dto';
import { UpdateMovieFuctionDto } from './dto/update-movie-fuction.dto';

@Controller('movie-fuctions')
export class MovieFuctionsController {
  constructor(private readonly movieFuctionsService: MovieFuctionsService) {}

  @Post()
  create(@Body() createMovieFuctionDto: CreateMovieFuctionDto) {
    return this.movieFuctionsService.create(createMovieFuctionDto);
  }

  @Get()
  findAll() {
    return this.movieFuctionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.movieFuctionsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMovieFuctionDto: UpdateMovieFuctionDto) {
    return this.movieFuctionsService.update(+id, updateMovieFuctionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.movieFuctionsService.remove(+id);
  }
}
