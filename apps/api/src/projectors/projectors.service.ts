import { Injectable } from '@nestjs/common';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';

@Injectable()
export class ProjectorsService {
  findAll() {
    return `This action returns all projectors`;
  }
}
