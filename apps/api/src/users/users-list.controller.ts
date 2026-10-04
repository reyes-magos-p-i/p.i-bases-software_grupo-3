import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdministratorGuard } from './guards/administrator.guard';
import { EmployeeGuard } from './guards/employee.guard';
import { UserIdParamsDto } from './dto/user-id-params.dto';
import {
  ListClientsQueryDto,
  ListEmployeesQueryDto,
} from './dto/list-users-query.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), EmployeeGuard)
export class UsersListController {
  constructor(private readonly usersService: UsersService) {}

  @Get('clients')
  listClients(@Query() query: ListClientsQueryDto) {
    return this.usersService.listClients(query);
  }

  @Get('employees/options')
  @UseGuards(AdministratorGuard)
  getEmployeeListOptions() {
    return this.usersService.getEmployeeListOptions();
  }

  @Get('employees')
  @UseGuards(AdministratorGuard)
  listEmployees(@Query() query: ListEmployeesQueryDto) {
    return this.usersService.listEmployees(query);
  }

  @Get('clients/:id')
  getClientDetail(@Param() params: UserIdParamsDto) {
    return this.usersService.getClientDetail(params.id);
  }

  @Get('employees/:id')
  @UseGuards(AdministratorGuard)
  getEmployeeDetail(@Param() params: UserIdParamsDto) {
    return this.usersService.getEmployeeDetail(params.id);
  }
}
