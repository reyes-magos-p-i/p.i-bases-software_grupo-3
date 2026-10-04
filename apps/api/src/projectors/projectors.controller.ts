import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';

@Controller('projectors')
export class ProjectorsController {
  constructor(private readonly projectorsService: ProjectorsService) {}

  @Get()
  findAll() {
    return this.projectorsService.findAll();
  }
}
