import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { ListCinemasQueryDto } from './dto/list-cinemas-query.dto';
import { CinemaIdParamsDto } from './dto/cinema-id-params.dto';

@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
@Controller('cinemas')
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}

  @Get()
  findAll() {
    return this.cinemasService.findAll();
  }

  @Get('list')
  listCinemas(@Query() query: ListCinemasQueryDto) {
    return this.cinemasService.listCinemas(query);
  }

  @Get('companies')
  listCompanies() {
    return this.cinemasService.listCompanies();
  }

  @Get(':id')
  getCinema(@Param() params: CinemaIdParamsDto) {
    return this.cinemasService.getCinema(params.id);
  }
}
