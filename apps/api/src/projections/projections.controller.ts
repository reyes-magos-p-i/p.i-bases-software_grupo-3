import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { EmployeeSessionOriginGuard } from '../auth/guards/employee-session-origin.guard';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import type { UserIdentity } from '../users/types/user-identity.type';
import { AvailableMoviesQueryDto } from './dto/available-movies-query.dto';
import { CreateProjectionDto } from './dto/create-projection.dto';
import { ProjectionsService } from './projections.service';

@Controller('projections')
@UseGuards(AuthGuard('jwt'), AdministratorGuard)
export class ProjectionsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get('options')
  getSchedulingOptions() {
    return this.projectionsService.getSchedulingOptions();
  }

  @Get('available-movies')
  findAvailableMovies(@Query() query: AvailableMoviesQueryDto) {
    return this.projectionsService.findAvailableMovies(query);
  }

  @Post()
  @UseGuards(EmployeeSessionOriginGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() data: CreateProjectionDto,
    @Req() request: Request & { user: UserIdentity },
  ) {
    return this.projectionsService.create(data, request.user.id);
  }
}
