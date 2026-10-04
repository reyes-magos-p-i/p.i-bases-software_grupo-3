import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { CreateCinemaDto } from './dto/create-cinema.dto';
import { UpdateCinemaDto } from './dto/update-cinema.dto';

@Controller('cinemas')
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}
  @Get()
  findAll() {
    return this.cinemasService.findAll();
  }
}
