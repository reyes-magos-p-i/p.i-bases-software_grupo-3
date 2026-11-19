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
  Req,
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
import type { Request } from 'express';
import type { UserIdentity } from '../users/types/user-identity.type';
import { ConfirmationEmailDto } from '../common/validation/confirmation-email.dto';
import { requireEmailConfirmation } from '../common/security/email-confirmation';

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
  deactivateCinema(
    @Param() params: CinemaIdParamsDto,
    @Body() data: ConfirmationEmailDto,
    @Req() request: Request & { user: UserIdentity },
  ) {
    requireEmailConfirmation(data.email, request.user.email);
    return this.cinemasService.deactivateCinema(params.id);
  }
}
