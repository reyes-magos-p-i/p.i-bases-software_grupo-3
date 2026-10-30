import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { SessionOriginGuard } from '../auth/guards/session-origin.guard';
import { ListCinemasQueryDto } from './dto/list-cinemas-query.dto';
import { CinemaIdParamsDto } from './dto/cinema-id-params.dto';
import { CreateCinemaDto } from './dto/create-cinema.dto';
import { UpdateCinemaDto } from './dto/update-cinema.dto';

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

  @Post()
  @UseGuards(SessionOriginGuard)
  @HttpCode(HttpStatus.CREATED)
  createCinema(@Body() data: CreateCinemaDto) {
    return this.cinemasService.createCinema(data);
  }

  @Patch(':id')
  @UseGuards(SessionOriginGuard)
  updateCinema(
    @Param() params: CinemaIdParamsDto,
    @Body() data: UpdateCinemaDto,
  ) {
    return this.cinemasService.updateCinema(params.id, data);
  }

  @Patch(':id/deactivate')
  @UseGuards(SessionOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateCinema(@Param() params: CinemaIdParamsDto) {
    return this.cinemasService.deactivateCinema(params.id);
  }
}
