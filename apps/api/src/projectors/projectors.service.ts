import { Injectable } from '@nestjs/common';
import { ProjectorsRepository } from './projectors.repository/projectors.repository';

@Injectable()
export class ProjectorsService {
  constructor(private readonly projectorsRepository: ProjectorsRepository) {}

  findAll() {
    return this.projectorsRepository.getProjectors();
  }
}
