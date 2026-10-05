import { Controller, Get, UseGuards} from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), AdministratorGuard)
@Controller('cinemas')
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}
  @Get()
  findAll() {
    return this.cinemasService.findAll();
  }
}
