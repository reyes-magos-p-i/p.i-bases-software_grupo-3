import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdministratorGuard } from './guards/administrator.guard';
import { EmployeeSessionOriginGuard } from '../auth/guards/employee-session-origin.guard';
import type { CreateClientDto } from './dto/create-client.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { CreatedUserDto } from './dto/created-user.dto';
import type { UserCreationOptionsDto } from './dto/user-creation-options.dto';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), AdministratorGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('creation-options')
  getCreationOptions(): Promise<UserCreationOptionsDto> {
    return this.usersService.getCreationOptions();
  }

  @Post()
  @UseGuards(EmployeeSessionOriginGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(CreateUserValidationPipe) data: CreateClientDto | CreateEmployeeDto,
  ): Promise<CreatedUserDto> {
    return this.usersService.create(data);
  }
}
