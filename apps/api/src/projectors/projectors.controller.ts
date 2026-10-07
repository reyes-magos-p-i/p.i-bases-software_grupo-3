import { Controller, Get, UseGuards} from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
@Controller('projectors')
export class ProjectorsController {
  constructor(private readonly projectorsService: ProjectorsService) {}

  @Get()
  findAll() {
    return this.projectorsService.findAll();
  }
}
