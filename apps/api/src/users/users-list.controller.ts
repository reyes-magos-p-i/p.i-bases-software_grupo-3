import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdministratorGuard } from './guards/administrator.guard';
import {
  ListClientsQueryDto,
  ListEmployeesQueryDto,
} from './dto/list-users-query.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
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
}
