import { Controller, Get, UseGuards} from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { CreateProjectorDto } from './dto/create-projector.dto';
import { UpdateProjectorDto } from './dto/update-projector.dto';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), AdministratorGuard)
@Controller('projectors')
export class ProjectorsController {
  constructor(private readonly projectorsService: ProjectorsService) {}

  @Get()
  findAll() {
    return this.projectorsService.findAll();
  }
}
