import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
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
