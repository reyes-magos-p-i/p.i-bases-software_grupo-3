import { Injectable } from '@nestjs/common';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';
import { ProjectorsRepository } from './projectors.repository/projectors.repository';

@Injectable()
export class ProjectorsService {
  constructor(private readonly projectorsRepository: ProjectorsRepository) {}

  findAll() {
    return this.projectorsRepository.getProjectors();
  }
}
