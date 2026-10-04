import { Injectable } from '@nestjs/common';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';

@Injectable()
export class ProjectorsService {
  create(createProjectorDto: CreateProjectorDto) {
    return 'This action adds a new projector';
  }

  findAll() {
    return `This action returns all projectors`;
  }

  findOne(id: number) {
    return `This action returns a #${id} projector`;
  }

  update(id: number, updateProjectorDto: UpdateProjectorDto) {
    return `This action updates a #${id} projector`;
  }

  remove(id: number) {
    return `This action removes a #${id} projector`;
  }
}
