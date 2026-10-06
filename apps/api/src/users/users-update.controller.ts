import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserIdentity } from './types/user-identity.type';
import { AuthGuard } from '@nestjs/passport';
import { EmployeeSessionOriginGuard } from '../auth/guards/employee-session-origin.guard';
import { AdministratorGuard } from './guards/administrator.guard';
import { EmployeeGuard } from './guards/employee.guard';
import { UserIdParamsDto } from './dto/user-id-params.dto';
import { UpdateClientDto, UpdateEmployeeDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), EmployeeGuard)
export class UsersUpdateController {
  constructor(private readonly usersService: UsersService) {}

  @Get('edit-options')
  getEditOptions() {
    return this.usersService.getEditOptions();
  }

  @Patch('clients/:id/deactivate')
  @HttpCode(204)
  @UseGuards(EmployeeSessionOriginGuard)
  deactivateClient(@Param() params: UserIdParamsDto, @Body() body: unknown) {
    this.requireEmptyBody(body);
    return this.usersService.deactivateClient(params.id);
  }

  @Patch('employees/:id/deactivate')
  @HttpCode(204)
  @UseGuards(AdministratorGuard, EmployeeSessionOriginGuard)
  deactivateEmployee(
    @Param() params: UserIdParamsDto,
    @Req() request: Request & { user: UserIdentity },
    @Body() body: unknown,
  ) {
    this.requireEmptyBody(body);
    return this.usersService.deactivateEmployee(params.id, request.user.id);
  }

  private requireEmptyBody(body: unknown) {
    if (
      body !== undefined &&
      (typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      throw new BadRequestException(
        'La desactivación no admite campos en la solicitud.',
      );
  }

  @Patch('clients/:id')
  @UseGuards(EmployeeSessionOriginGuard)
  updateClient(
    @Param() params: UserIdParamsDto,
    @Body() data: UpdateClientDto,
  ) {
    return this.usersService.updateClient(params.id, data);
  }

  @Patch('employees/:id')
  @UseGuards(AdministratorGuard, EmployeeSessionOriginGuard)
  updateEmployee(
    @Param() params: UserIdParamsDto,
    @Body() data: UpdateEmployeeDto,
  ) {
    return this.usersService.updateEmployee(params.id, data);
  }
}
