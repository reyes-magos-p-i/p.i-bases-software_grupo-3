import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { EmployeeSessionOriginGuard } from '../auth/guards/employee-session-origin.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import type { UserIdentity } from '../users/types/user-identity.type';
import { AvailableMoviesQueryDto } from './dto/available-movies-query.dto';
import { CreateProjectionDto } from './dto/create-projection.dto';
import { ListProjectionsQueryDto } from './dto/list-projections-query.dto';
import { ProjectionIdParamsDto } from './dto/projection-id-params.dto';
import { UpdateProjectionDto } from './dto/update-projection.dto';
import { ProjectionsService } from './projections.service';

@Controller('projections')
@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
export class ProjectionsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get('options')
  getSchedulingOptions() {
    return this.projectionsService.getSchedulingOptions();
  }

  @Get('filter-options')
  getFilterOptions() {
    return this.projectionsService.getFilterOptions();
  }

  @Get('available-movies')
  findAvailableMovies(@Query() query: AvailableMoviesQueryDto) {
    return this.projectionsService.findAvailableMovies(query);
  }

  @Get()
  list(@Query() query: ListProjectionsQueryDto) {
    return this.projectionsService.list(query);
  }

  @Get(':id')
  findOne(@Param() params: ProjectionIdParamsDto) {
    return this.projectionsService.findOne(params.id);
  }

  @Put(':id')
  @UseGuards(EmployeeSessionOriginGuard)
  update(
    @Param() params: ProjectionIdParamsDto,
    @Body() data: UpdateProjectionDto,
    @Req() request: Request & { user: UserIdentity },
  ) {
    return this.projectionsService.update(params.id, data, request.user.id);
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
