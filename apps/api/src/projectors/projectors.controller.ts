import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';

@Controller('projectors')
export class ProjectorsController {
  constructor(private readonly projectorsService: ProjectorsService) {}

  @Post()
  create(@Body() createProjectorDto: CreateProjectorDto) {
    return this.projectorsService.create(createProjectorDto);
  }

  @Get()
  findAll() {
    return this.projectorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectorsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProjectorDto: UpdateProjectorDto) {
    return this.projectorsService.update(+id, updateProjectorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectorsService.remove(+id);
  }
}
