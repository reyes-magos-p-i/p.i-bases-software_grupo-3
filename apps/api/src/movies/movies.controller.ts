import { Controller, Post, Get, Patch, Param, Delete, Body} from '@nestjs/common';
import { MoviesService } from './movies.service';
import { CreateMovieDto } from './dto/createMovie.dto/createMovie.dto';
import { UpdateMovieDto } from './dto/createMovie.dto/updateMovie.dto';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Post()
  create(@Body() dto: CreateMovieDto) {
    return this.moviesService.create(dto);
  }

  @Get()
  findAll() {
    return this.moviesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.moviesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateMovieDto,
  ) {
    return this.moviesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.moviesService.remove(id);
  }


}
