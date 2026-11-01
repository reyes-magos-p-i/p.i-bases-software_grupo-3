import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { MoviesService } from './movies.service';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), AdministratorGuard)
@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
  ) {}

  @Post()
  create(@Body() dto: CreateMovieDto) {
    return this.moviesService.create(dto);
  }

  @Get()
  findAll() {
    return this.moviesService.findAll();
  }

  @Get('classifications')
    findClassifications() {
    return this.moviesService.findClassifications();
  }

  @Get('genres')
  findGenres() {
    return this.moviesService.findGenres();
  }

  @Get('languages')
  findLanguages() {
    return this.moviesService.findLanguages();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.moviesService.findOne(id);
  }



  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMovieDto,
  ) {
    return this.moviesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.moviesService.remove(id);
  }
}
